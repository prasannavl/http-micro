import * as http from "http";
import * as rawBody from "raw-body";
import * as qs from "querystring";
import * as typeis from "type-is";
import * as httpError from "http-errors";
import { IContext } from "./core";

export type ParserCallback = (error: rawBody.RawBodyError, body?: string) => void;
export type Parser = (req: http.IncomingMessage, res: http.ServerResponse, callback: ParserCallback) => void;
const defaultLimit = 1024 * 1024 / 2; // 512Kb

export function rawBodyParserFactory(opts: rawBody.Options) {
    return function rawParser(req: http.IncomingMessage, res: http.ServerResponse, callback: ParserCallback) {

        var limit = opts.limit || defaultLimit;
        var contentLength = req.headers ?
            Number(req.headers["content-length"]) : null;
        let encoding = opts.encoding !== undefined ? opts.encoding : true;

        rawBody(req, {
            limit: limit,
            length: contentLength,
            encoding,
        }, callback);
    };
}

export type JsonBodyParserOpts = rawBody.Options & { reviver?: (key: any, value: any) => any };

export function jsonBodyParserFactory(opts: JsonBodyParserOpts, defaultParser?: Parser) {
    let rawParser = defaultParser || rawBodyParserFactory(opts);
    let reviver = opts.reviver;

    return function jsonParser(req: http.IncomingMessage, res: http.ServerResponse, callback: ParserCallback) {
        rawParser(req, res, function (err, body) {
            if (err) {
                return callback(err);
            }
            let res;
            try {
                res = JSON.parse(body, reviver);
            } catch (e) {
                return callback(e);
            }
            callback(null, res);
        });
    };
}

export type FormBodyParserOpts = rawBody.Options & {
    parser?: (str: string, sep?: string, eq?: string, options?: qs.ParseOptions) => any;
    sep?: string;
    eq?: string;
    options?: qs.ParseOptions;
};

export function formBodyParserFactory(opts: FormBodyParserOpts, defaultParser?: Parser) {
    let rawParser = defaultParser || rawBodyParserFactory(opts);
    let qsParse = opts.parser || qs.parse;
    let sep = opts.sep;
    let eq = opts.eq;
    let options = opts.options;

    return function jsonParser(req: http.IncomingMessage, res: http.ServerResponse, callback: ParserCallback) {
        rawParser(req, res, function (err, body) {
            if (err) {
                return callback(err);
            }
            let res;
            try {
                res = qsParse(body, sep, eq, options);
            } catch (e) {
                return callback(e);
            }
            callback(null, res);
        });
    };
}

export type AnyParserOptions = FormBodyParserOpts & JsonBodyParserOpts;  

export function anyBodyParserFactory(opts: AnyParserOptions, defaultParser?: Parser) {
    let rawParser = defaultParser || rawBodyParserFactory(opts);
    let jsonParser = jsonBodyParserFactory(opts, rawParser);
    let formParser = formBodyParserFactory(opts, rawParser);
    let types = ["json", "urlencoded"];

    return function anyBodyParser(req: http.IncomingMessage, res: http.ServerResponse, callback: ParserCallback) {
        let t = typeis(req, types);
        switch (t) {
            case types[0]: {
                jsonParser(req, res, callback);
                break;
            }
            case types[1]: {
                formParser(req, res, callback);
                break;
            }
            default: {
                rawParser(req, res, callback);
            }
        }
    };
}

export function parserFactory(opts: AnyParserOptions) {
    let parser = anyBodyParserFactory(opts);
    return function parse(context: IContext): Promise<any> {
        let req = context.req;
        let res = context.res;
        return new Promise((resolve, reject) => {
            parser(req, res, (err, body) => {
                if (err) {
                    reject(new httpError.BadRequest(err.message));
                } else {
                    resolve(body);
                }
            });
        });
    }
}

export function createAsyncParser(parser: Parser = anyBodyParserFactory({}), errorExpose = false) {
    return function parse(context: IContext): Promise<any> {
        let req = context.req;
        let res = context.res;
        return new Promise((resolve, reject) => {
            parser(req, res, (err, body) => {
                if (err) {
                    let errObj = errorExpose ? new httpError.BadRequest(err.message) : new httpError.BadRequest();
                    reject(errObj);
                } else {
                    resolve(body);
                }
            });
        });
    }
}