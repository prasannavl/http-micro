import { Middleware, IApplication, Application } from "./core";
import * as http from "http";
import * as url from "url";
import { stringify } from "./utils";
import { isString } from "./lang";
import { RouteContext } from "./route-context";
import * as bodyParser from "./body-parser";
import * as contentType from "content-type";
import { intoHttpError } from "./error-utils";
import { RequestUtils, ResponseUtils } from "./context-utils";
import * as httpError from "http-errors";

export class Context {
    items: Map<string, any>;
    requestParser: bodyParser.Parser;

    private _contentType: contentType.MediaType;
    private _url: url.Url = null;
    private _ipAddresses: string[] = null;
    private _routeContext: RouteContext = null;
    private _bodyParseTask: any = null;

    constructor(
        public app: IApplication,
        public req: http.IncomingMessage,
        public res: http.ServerResponse,
        requestParser?: bodyParser.Parser) {
        if (requestParser !== undefined) this.requestParser = requestParser;
        if (this.requestParser === undefined) this.requestParser = bodyParser.anyBodyParserFactory();
    }

    getItem<T = any>(key: string): T {
        if (this.items) {
            let res = this.items.get(key);
            if (res !== undefined) return res;
        }
        let appItems = this.app.items;
        if (appItems) {
            let res = appItems.get(key);
            if (res !== undefined) return res;
        }
        return null;
    }

    setItem<T = any>(key: string, value: T): void {
        if (!this.items) {
            this.items = new Map<string, any>();
        }
        this.items.set(key, value);
    }

    hasItem(key: string): boolean {
        if (this.items) {
            let res = this.items.has(key);
            if (res) return res;
        }
        let appItems = this.app.items;
        if (appItems) {
            let res = appItems.get(key);
            if (res) return res;
        }
        return false;
    }

    getUrl() {
        if (this._url === null) {
            this._url = url.parse(this.req.url);
        }
        return this._url;
    }

    getRouteContext() {
        return this._routeContext || (this._routeContext = new RouteContext(this.getUrl().pathname));
    }

    getRouteParams() {
        return this.getRouteContext().params;
    }

    getHttpMethod() {
        return this.req.method;
    }

    getRequestStream() {
        // TODO: Do request stream pre-processing, like 
        // Content-Encoding, Transfer-Encoding of gzip, etc.
        return this.req;
    }

    getResponseStream() {
        // TODO: Do post processing of stream, like 
        // Content-Encoding, Transfer-Encoding of gzip, etc.
        return this.res;
    }

    getRequestBody<T>(parser?: bodyParser.Parser): Promise<T> {
        if (this._bodyParseTask === null) {
            let task = bodyParser.parseBody<T>(this.getRequestStream(), null, parser || this.requestParser);
            this._bodyParseTask = task;
            return task;
        }
        return this._bodyParseTask;
    }

    getContentType() {
        if (this._contentType !== undefined)
            return this._contentType;
        return (this._contentType = RequestUtils.getContentType(this.req));
    }

    getClientIpAddress() {
        return this.getUpstreamIpAddresses()[0];
    }

    getUpstreamIpAddresses() {
        let existing = this._ipAddresses;
        if (existing) return existing;
        return this._ipAddresses = RequestUtils.getUpstreamIpAddresses(this.req);
    }

    getHost(): string {
        return RequestUtils.getHost(this.req);
    }

    getProtocol(): string {
        return RequestUtils.getProtocol(this.req);
    }

    isEncrypted() {
        return RequestUtils.isEncrypted(this.req);
    }

    setHeader(key: string, value: string, replace = true) {
        return ResponseUtils.setHeader(this.res, key, value, replace);
    }

    setHeaders(headers: any) {
        ResponseUtils.setHeaders(this.res, headers);
    }

    appendHeaderValue(key: string, value: string, forceAppend = false) {
        ResponseUtils.appendHeaderValue(this.res, key, value, forceAppend);
    }

    removeHeaderValue(key: string, value: string, removeHeaderIfEmpty = true) {
        ResponseUtils.removeHeaderValue(this.res, key, value, removeHeaderIfEmpty);
    }

    setContentType(value: string, force = false) {
        ResponseUtils.setContentType(this.res, value, force);
    }

    setStatus(code: number, message?: string) {
        ResponseUtils.setStatus(this.res, code, message);
    }

    sendStatus(code: number, message?: string, headers?: any) {
        ResponseUtils.sendStatus(this.res, code, message, headers);
    }

    send(body: any, headers?: any, code = 200) {
        ResponseUtils.send(this.res, body, headers, code);
    }

    sendText(text: string) {
        ResponseUtils.sendText(this.res, text);
    }

    sendAsJson(data: any,
        replacer?: (key: string, value: any) => any,
        spaces?: string | number) {
        ResponseUtils.sendAsJson(this.res, data, replacer, spaces);
    }

    sendNoContent(headers?: any) {
        ResponseUtils.sendNoContent(this.res, headers);
    }

    sendResetContent(headers?: any) {
        ResponseUtils.sendResetContent(this.res, headers);
    }

    sendBadRequest(body: any, headers?: any) {
        ResponseUtils.sendBadRequest(this.res, body, headers);
    }

    sendNotFound(reason: string = null, headers?: any) {
        ResponseUtils.sendNotFound(this.res, reason, headers);
    }

    sendForbidden(reason: any, headers?: any) {
        ResponseUtils.sendForbidden(this.res, reason, headers);
    }

    sendMethodNotAllowed(allowedMethods: string[] | string, reason: string = null, headers?: any) {
        ResponseUtils.sendMethodNotAllowed(this.res, allowedMethods, reason, headers);
    }

    throw(error: Error): never;
    throw(status: number, error: Error): never;
    throw(status: number, msg?: string): never;
    throw(arg1: number | Error, arg2?: string | Error): never {
        if (typeof arg1 !== "number") {
            let status = arg1;
            throw intoHttpError(status);
        }
        let status = arg1;        
        if (!arg2 || typeof arg2 === "string") {
            let msg = arg2;
            throw httpError(status, msg);
        }
        let error = arg2;
        throw intoHttpError(error, status, true);
    }
}

export function contextFactory(app: IApplication,
    req: http.IncomingMessage, res: http.ServerResponse, parser?: bodyParser.Parser) {
    return new Context(app, req, res, parser);
}
