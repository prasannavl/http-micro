import * as http from "http";
import { Middleware, IContext, IApplication, ApplicationCore } from "./core";

export class NodeContext implements IContext {
    items: Map<string, any>;
    
    constructor(
        public app: IApplication,
        public req: http.IncomingMessage,
        public res: http.ServerResponse) {
    }

    private getItems() {
        return this.items || (this.items = new Map<string, any>());
    }

    get(key: string): any {
        if (this.items) {
            let res = this.items.get(key);
            if (res !== undefined) return res;
        }
        if (this.app.items) {
            let res = this.items.get(key);
            if (res !== undefined) return res;
        }
        return null;
    }

    set(key: string, value: any): void {
        if (!this.items) {
            this.items = new Map<string, any>();
        }
        this.items.set(key, value);
    }

    has(key: string): boolean {
        if (this.items) {
            let res = this.items.has(key);
            if (res) return res;
        }
        if (this.app.items) {
            let res = this.items.get(key);
            if (res) return res;
        }
        return false;
    }
}

export type NodeMiddleware = Middleware<NodeContext>;

export function nodeContextFactory(app: IApplication, req: http.IncomingMessage, res: http.ServerResponse) {
    return new NodeContext(app, req, res);
}

export class NodeApplication extends ApplicationCore<NodeContext> {
    constructor() {
        super(nodeContextFactory);
    }
}