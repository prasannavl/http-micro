import { ApplicationCore } from "./core";
import { NativeContext } from "./native-app";

export class Context extends NativeContext {
    
}

export class Application extends ApplicationCore<Context> {
    constructor() {
        super(Context);
    }
}