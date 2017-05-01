import { Middleware, IContext, IApplication, ApplicationCore } from "./core";
import { NodeContext } from "./core-node";
import * as http from "http";
import * as url from "url";
import { stringify } from "./utils";
import {Context, contextFactory } from "./context";

export class Application extends ApplicationCore<Context> {
    constructor() {
        super(contextFactory);
    }
}