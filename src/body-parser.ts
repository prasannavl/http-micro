import * as http from "http";
import * as rawBody from "raw-body";
import * as qs from "querystring";

export type ParserCallback = (error: rawBody.RawBodyError, body?: string) => void;
const defaultLimit = 1024 * 1024 / 2; // 512Kb

export function rawBodyParserFactory(req: http.IncomingMessage, res: http.ServerResponse, opts: rawBody.Options) {
    return function rawParser(callback: ParserCallback) {

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

export interface JsonBodyParserOpts extends rawBody.Options { reviver?: (key: any, value: any) => any };

export function jsonBodyParserFactory(req: http.IncomingMessage, res: http.ServerResponse, opts: JsonBodyParserOpts) {
    let rawParser = rawBodyParserFactory(req, res, opts);
    let reviver = opts.reviver;

    return function jsonParser(callback: ParserCallback) {
        rawParser(function (err, body) {
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

export interface FormBodyParserOpts extends rawBody.Options {
    parser?: (str: string, sep?: string, eq?: string, options?: qs.ParseOptions) => any;
    sep?: string;
    eq?: string;
    options?: qs.ParseOptions;
};

export function formBodyParserFactory(req: http.IncomingMessage, res: http.ServerResponse, opts: FormBodyParserOpts) {
    let rawParser = rawBodyParserFactory(req, res, opts);
    let qsParse = opts.parser || qs.parse;
    let sep = opts.sep;
    let eq = opts.eq;
    let options = opts.options;

    return function jsonParser(callback: ParserCallback) {
        rawParser(function (err, body) {
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