import { Facet } from "@codemirror/state";
import { Workspace } from "./workspace";

function useLast<T>(init: T): (values: readonly T[]) => T {
    return (values) => values.reduce((_, v) => v, init);
}

// export const serverUri = Facet.define<string, string>({ combine: useLast("") });
// export const rootUri = Facet.define<string | null, string | null>({ combine: useLast<string | null>("") });
// export const workspaceFolders = Facet.define<LSP.WorkspaceFolder[] | null, LSP.WorkspaceFolder[] | null>({ combine: useLast<LSP.WorkspaceFolder[] | null>(null) });
export const documentUri = Facet.define<string, string>({ combine: useLast("") });
export const languageId = Facet.define<string, string>({ combine: useLast("") });
export const workspace = Facet.define<Workspace, Workspace>({ });
