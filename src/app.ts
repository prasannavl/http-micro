import { ApplicationCore } from "./core";
import { NodeContext } from "./node-app";

export class Context extends NodeContext {
    
}

export class Application extends ApplicationCore<Context> {
    constructor() {
        super(Context);
    }
}