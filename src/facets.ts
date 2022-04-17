import type * as LSP from 'vscode-languageserver-protocol';
import { Facet } from "@codemirror/state";

const useLast = (values: readonly any[]) => values.reduce((_, v) => v, '');

export const serverUri = Facet.define<string, string>({ combine: useLast });
export const rootUri = Facet.define<string | null, string | null>({ combine: useLast });
export const workspaceFolders = Facet.define<LSP.WorkspaceFolder[] | null, LSP.WorkspaceFolder[] | null>({ combine: useLast });
export const documentUri = Facet.define<string, string>({ combine: useLast });
export const languageId = Facet.define<string, string>({ combine: useLast });
