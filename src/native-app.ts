import * as http from "http";
import { Middleware, IContext, ApplicationCore } from "./core";

export type NativeMiddleware = Middleware<NativeContext>;

export class NativeContext implements IContext {
    constructor(
        public req: http.IncomingMessage,
        public res: http.ServerResponse) {
    }
}

export class NativeApplication extends ApplicationCore<NativeContext> {
    constructor() {
        super(NativeContext);
    }
}