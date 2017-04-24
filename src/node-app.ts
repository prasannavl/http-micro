import * as http from "http";
import { Middleware, IContext, ApplicationCore } from "./core";

export type NodeMiddleware = Middleware<NodeContext>;

export class NodeContext implements IContext {
    constructor(
        public req: http.IncomingMessage,
        public res: http.ServerResponse) {
    }
}

export class NodeApplication extends ApplicationCore<NodeContext> {
    constructor() {
        super(NodeContext);
    }
}