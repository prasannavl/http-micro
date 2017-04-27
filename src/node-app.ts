import * as http from "http";
import { Middleware, IContext, IApplication, ApplicationCore } from "./core";

export type NodeMiddleware = Middleware<NodeContext>;

export class NodeContext implements IContext {
    private _items: Map<string, any>;
    
    constructor(
        public app: IApplication,
        public req: http.IncomingMessage,
        public res: http.ServerResponse) {
    }

    getItems() {
        return this._items || (this._items = new Map<string, any>());
    }
}

export function nodeContextFactory(app: IApplication, req: http.IncomingMessage, res: http.ServerResponse) {
    return new NodeContext(app, req, res);
}

export class NodeApplication extends ApplicationCore<NodeContext> {
    constructor() {
        super(nodeContextFactory);
    }
}