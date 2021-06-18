import * as React from "react";
import * as ReactDOM from "react-dom";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import {
  ServerConnection,
  ServerState,
  GenerationAndCount,
  ServerListCache,
  PendingEntry,
  UnclearedPosting,
  InvalidReference,
  JournalError
} from "./server_connection";
import {
  EditorComponent,
  SelectFileOptions as EditorSelectFileOptions
} from "./editor";
import { PendingEntriesComponent, PendingEntryHighlightState } from "./pending";
import { JournalErrorsComponent } from "./journal_errors";
import { CandidatesComponent, CandidateSelectionState } from "./candidates";
import { InvalidReferencesComponent } from "./invalid_references";
import { UnclearedPostingsComponent } from "./uncleared";
import { SourceDataComponent } from "./source_data";
import { SettingsComponentState, SettingsComponent } from "./settings";

import commonPrefix from "common-prefix";

import "./styles.css";

import styled from "styled-components";
import { VirtualListScrollState } from "./virtual_list";
import { ServerVirtualListState } from "./server_virtual_list";

export interface SelectFileOptions extends EditorSelectFileOptions {
  switchTo?: boolean;
}

export interface AssociatedDataViewController {
  selectFile(
    filename?: string,
    line?: number,
    options?: SelectFileOptions
  ): void;
  selectFileByMeta(meta: any, options?: SelectFileOptions): void;
  highlightPending(index: number): void;
}

export const AssociatedDataViewContext = React.createContext<
  AssociatedDataViewController
>(undefined as any);
export const CommonJournalPrefixContext = React.createContext<string>("");

export interface SelectFileFunction {
  (filename?: string, line?: number, focus?: boolean): void;
}

const AppRootElement = styled.div`
  position: absolute;
  top: 0px;
  left: 0px;
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
`;

const SplitContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: row;
`;

const SplitChild = styled.div`
  width: 50%;
  display: flex;
  flex-direction: column;
`;

const AppTabs = styled(Tabs)`
  display: flex;
  flex-direction: column;
  flex: 1;
`;

const AppTabPanel = styled(TabPanel).attrs({ selectedClassName: "" })`
  display: ${(props: any) => (props.selected ? "flex" : "none")};
  flex-direction: column;
  flex: 1;
`;

const CandidatesUnavailable = styled.div`
  display: flex;
  flex: 1;
  justify-content: center;
  align-items: center;
`;

const StatusBar = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 4px;
  border-top: 1px solid var(--color-main-accent);
  background-color: var(--color-main-bg);
`;

enum TabKeys {
  candidates,
  uncleared,
  invalid,
  errors
}

enum DataTabKeys {
  pending,
  journal,
  source
}

function enumValueFor<U>(
  enumObject: { [x: string]: any },
  key: string,
  defaultValue: U
) {
  return enumObject.hasOwnProperty(key)
    ? (enumObject[key] as number)
    : defaultValue;
}

interface AppState extends Partial<ServerState> {
  journalDirty: boolean;
  selectedTab: number;
  selectedDataTab: number;
  settingsOpen: boolean;
  settingsCandidatesLeft: boolean;
}

class AppComponent
  extends React.PureComponent<{ serverConnection: ServerConnection }, AppState>
  implements AssociatedDataViewController {
  private editorRef = React.createRef<EditorComponent>();
  private pendingHighlightState = new PendingEntryHighlightState();

  private candidateSelectionState = new CandidateSelectionState();

  private pendingListState = new ServerVirtualListState<PendingEntry>(
    this.props.serverConnection,
    "pending"
  );
  private unclearedListState = new ServerVirtualListState<UnclearedPosting>(
    this.props.serverConnection,
    "uncleared"
  );
  private invalidListState = new ServerVirtualListState<InvalidReference>(
    this.props.serverConnection,
    "invalid"
  );
  private errorListState = new ServerVirtualListState<JournalError>(
    this.props.serverConnection,
    "errors"
  );

  private serverListener = (state: Partial<ServerState>) => {
    if (
      state.pending_index != null &&
      state.pending != null &&
      (this.state.pending == null ||
        this.state.pending[0] !== state.pending[0] ||
        this.state.pending_index !== state.pending_index)
    ) {
      this.pendingListState.scrollState.scrollToIndex(state.pending_index);
    }
    this.setState(state);
  };

  componentDidMount() {
    this.props.serverConnection.addListener(this.serverListener);
  }

  componentWillUnmount() {
    this.props.serverConnection.removeListener(this.serverListener);
  }

  private setUrlFromTab(state: {
    selectedTab: number;
    selectedDataTab: number;
  }) {
    const newHash = `#${TabKeys[state.selectedTab]}+${
      DataTabKeys[state.selectedDataTab]
    }`;
    if (newHash !== location.hash) {
      history.pushState(null, "", newHash);
    }
  }

  private getSelectedTabsFromUrl() {
    const hash = location.hash;
    const m = hash.match(/^#([a-z]+)\+([a-z]+)$/);
    let index = TabKeys.candidates;
    let dataIndex = DataTabKeys.pending;
    if (m !== null) {
      index = enumValueFor(TabKeys, m[1], index);
      dataIndex = enumValueFor(DataTabKeys, m[2], dataIndex);
    }
    const result = { selectedTab: index, selectedDataTab: dataIndex };
    this.setUrlFromTab(result);
    return result;
  }

  state: AppState = {
    ...this.props.serverConnection.state,
    journalDirty: false,
    ...this.getSelectedTabsFromUrl(),
    settingsOpen: false,
    settingsCandidatesLeft: false
  };

  selectFile = (
    filename?: string,
    line?: number,
    options: SelectFileOptions = {}
  ) => {
    const editor = this.editorRef.current;
    if (editor === null) {
      return;
    }
    const { switchTo = true } = options;
    if (switchTo) {
      this.setState({ selectedDataTab: DataTabKeys.journal });
    }
    editor.selectFile(filename, line, options);
  };

  selectFileByMeta(meta: any, options?: SelectFileOptions) {
    this.selectFile(meta["filename"], meta["lineno"] - 1, options);
  }

  private handleSelectTab = (index: number) => {
    if (this.state.journalDirty) {
      // Don't allow selecting tabs with unsaved local edits to journal.
      return;
    }
    this.setState({ selectedTab: index });
  };

  private handleSelectDataTab = (index: number) => {
    if (this.state.journalDirty) {
      // Don't allow selecting tabs with unsaved local edits to journal.
      return;
    }
    this.setState({ selectedDataTab: index });
  };

  private handleToggleSettings = (open?: boolean) => {
    this.setState({
      settingsOpen:
        typeof open !== "undefined" ? open : !this.state.settingsOpen
    });
  };

  private handleSettingsChange = (settings: SettingsComponentState) => {
    this.setState({
      settingsCandidatesLeft: settings.candidatesLeft
    });
  };

  componentDidUpdate() {
    this.setUrlFromTab(this.state);
  }

  render() {
    if (this.state.closed) {
      return (
        <AppRootElement
          style={{
            textAlign: "center",
            justifyContent: "center"
          }}
        >
          Server connection closed, waiting to reconnect.
        </AppRootElement>
      );
    }
    const commonJournalPrefix = commonPrefix(
      this.state.journal_filenames || []
    );
    const { selectedTab, selectedDataTab } = this.state;
    const hasCandidates =
      this.state.candidates != null && this.state.candidates_generation != null;

    const getOptionalCount = (x: GenerationAndCount | null | undefined) => {
      return x != null ? ` (${x[1]})` : undefined;
    };
    return (
      <AssociatedDataViewContext.Provider value={this}>
        <CommonJournalPrefixContext.Provider value={commonJournalPrefix}>
          <AppRootElement>
            <SplitContainer>
              <SplitChild
                style={{
                  flexDirection: "column",
                  borderLeft: !this.state.settingsCandidatesLeft ? "1px solid var(--color-nav-bg)" : "",
                  borderRight: this.state.settingsCandidatesLeft ? "1px solid var(--color-nav-bg)" : "",
                  order: this.state.settingsCandidatesLeft ? 0 : 1
                }}
              >
                <AppTabs
                  onSelect={this.handleSelectTab}
                  selectedIndex={this.state.selectedTab}
                >
                  <TabList>
                    <Tab>
                      Candidates
                      {this.state.candidates != null &&
                      this.state.candidates.candidates.length > 0
                        ? ` (${this.state.candidates.candidates.length})`
                        : undefined}
                    </Tab>
                    <Tab>
                      Uncleared
                      {getOptionalCount(this.state.uncleared)}
                    </Tab>
                    <Tab>
                      Invalid
                      {getOptionalCount(this.state.invalid)}
                    </Tab>
                    <Tab>
                      Errors
                      {getOptionalCount(this.state.errors)}
                    </Tab>
                  </TabList>
                  <AppTabPanel>
                    {hasCandidates && !this.state.journalDirty ? (
                      <CandidatesComponent
                        serverConnection={this.props.serverConnection}
                        associatedDataViewController={this}
                        accounts={this.state.accounts || []}
                        pendingIndex={this.state.pending_index!}
                        numPending={
                          this.state.pending == null ? 0 : this.state.pending[1]
                        }
                        candidatesGeneration={this.state.candidates_generation!}
                        candidates={this.state.candidates!}
                        highlightPending={this.highlightPending}
                        candidateSelectionState={this.candidateSelectionState}
                      />
                    ) : (
                      undefined
                    )}
                    {hasCandidates && this.state.journalDirty
                      ? <CandidatesUnavailable>Candidates not available due to unsaved local edits to journal.</CandidatesUnavailable>
                      : undefined}
                    {!hasCandidates ? <CandidatesUnavailable>"No pending entries."</CandidatesUnavailable> : undefined}
                  </AppTabPanel>
                  <AppTabPanel>
                    <UnclearedPostingsComponent
                      listState={this.unclearedListState}
                    />
                  </AppTabPanel>
                  <AppTabPanel>
                    <InvalidReferencesComponent
                      listState={this.invalidListState}
                    />
                  </AppTabPanel>
                  <AppTabPanel>
                    <JournalErrorsComponent listState={this.errorListState} />
                  </AppTabPanel>
                </AppTabs>
              </SplitChild>
              <SplitChild>
                <AppTabs
                  onSelect={this.handleSelectDataTab}
                  selectedIndex={this.state.selectedDataTab}
                >
                  <TabList>
                    <Tab>
                      Pending
                      {getOptionalCount(this.state.pending)}
                    </Tab>
                    <Tab>Editor</Tab>
                    <Tab>Source data</Tab>
                  </TabList>
                  <AppTabPanel>
                    {this.state.pending != null && (
                      <PendingEntriesComponent
                        selectedIndex={this.state.pending_index!}
                        listState={this.pendingListState}
                        highlightState={this.pendingHighlightState}
                        onSelect={this.handleSelectPending}
                      />
                    )}
                  </AppTabPanel>
                  <AppTabPanel forceRender={true}>
                    <EditorComponent
                      ref={this.editorRef}
                      commonJournalPrefix={commonJournalPrefix}
                      serverConnection={this.props.serverConnection}
                      dirtyStateDidChange={this.dirtyStateDidChange}
                    />
                  </AppTabPanel>
                  <AppTabPanel>
                    <SourceDataComponent
                      candidateSelectionState={this.candidateSelectionState}
                    />
                  </AppTabPanel>
                </AppTabs>
              </SplitChild>
            </SplitContainer>
            <StatusBar>
              {this.state.message || ""}
              <SettingsComponent
                isOpen={this.state.settingsOpen}
                onToggle={this.handleToggleSettings}
                onSettingsChange={this.handleSettingsChange}
              />
            </StatusBar>
          </AppRootElement>
        </CommonJournalPrefixContext.Provider>
      </AssociatedDataViewContext.Provider>
    );
  }

  private handleSelectPending = (index: number) => {
    this.setState({ selectedTab: TabKeys.candidates });
    this.props.serverConnection.skipTo(index);
  };

  private dirtyStateDidChange = (dirty: boolean) => {
    this.setState({ journalDirty: dirty });
  };

  highlightPending = (index: number) => {
    this.setState({ selectedDataTab: DataTabKeys.pending });
    this.pendingHighlightState.set(index);
    this.pendingListState.scrollState.scrollToIndex(index);
  };
}

const link = document.createElement("link");
link.setAttribute(
  "href",
  "https://fonts.googleapis.com/css2?family=Inconsolata&family=Roboto:wght@400;500&display=swap"
);
link.setAttribute("rel", "stylesheet");
document.body.appendChild(link);

const root = document.createElement("div");
document.body.appendChild(root);

ReactDOM.render(
  <AppComponent serverConnection={new ServerConnection()} />,
  root
);
