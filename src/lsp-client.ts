import Client, { RequestManager, WebSocketTransport } from "@open-rpc/client-js";
import { LSPNotifyMap, LSPRequestMap, Notification } from "./types";
import { handlePromise } from "./util";

export class LSPClient {
    private transport: WebSocketTransport;
    private requestManager: RequestManager;
    private client: Client;

    public notificationHandler?: (notification: Notification) => void;

    constructor(serverUri: string) {
        this.transport = new WebSocketTransport(serverUri);

        this.requestManager = new RequestManager([this.transport]);

        this.client = new Client(this.requestManager);
        this.client.onNotification((data) => {
            if(this.notificationHandler) {
                this.notificationHandler?.(data as Notification)
            } else {
                console.warn("missing notification handler for lsp client");
            }
        });

        this.transport.connection.addEventListener('message', (message: any) => {
            const data = JSON.parse(message.data as string);
            if (data.id) {
                /** 
                 * This client does not accept requests, so just respond with null.
                 */
                handlePromise(this.transport.connection.send(
                    JSON.stringify({
                        jsonrpc: '2.0',
                        id: data.id,
                        result: null
                    })
                ));
            }
        });
    }

    public async request<K extends keyof LSPRequestMap>(method: K, params: LSPRequestMap[K][0], timeout: number): Promise<LSPRequestMap[K][1]> {
        return await this.client.request({ method, params }, timeout);
    }

    public async notify<K extends keyof LSPNotifyMap>(method: K, params: LSPNotifyMap[K]): Promise<LSPNotifyMap[K]> {
        return await this.client.notify({ method, params });
    }

    public destroy(): void {
        this.client.close();
    }
}