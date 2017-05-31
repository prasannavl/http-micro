import * as http from "http";
import * as rawBody from "raw-body";
import * as qs from "querystring";
import * as typeis from "type-is";
import * as httpError from "http-errors";
import * as contentType from "content-type";
import * as mimeTypes from "mime-types";
import { isHttpError, wrapError } from "./error-utils";

export type ParserCallback = (error: rawBody.RawBodyError, body?: string) => void;
export type Parser = (req: http.IncomingMessage, callback: ParserCallback) => void;
const defaultLimit = 1024 * 1024 / 2; // 512Kb

export function rawBodyParserFactory(opts: rawBody.Options) {
    return function rawParser(req: http.IncomingMessage, callback: ParserCallback, state?: any) {
        if (handleRequestBodyAbsence(req, callback)) return;

        var limit = opts.limit || defaultLimit;
        var contentLength = opts.length || Number(req.headers["content-length"]);
        let encoding = opts.encoding;
        if (encoding === undefined) {
            let contentTypeHeader = req.headers["content-type"];
            // Ensure that further attempts are skipped, as contentType
            // will throw on invalid header. Since rawParser could 
            // potentially be passed on it's own to get a buffer back.
            if (contentTypeHeader) {
                let ct = contentType.parse(contentTypeHeader);
                encoding = ct.parameters["charset"] as any;
                if (!encoding) {
                    // No valid encoding was found, but content-type
                    // header is valid. So, pick up the default 
                    // encoding for the mime.
                    encoding = mimeTypes.charset(ct.type) as string;
                }
            }
        }

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

    return function jsonParser(req: http.IncomingMessage, callback: ParserCallback, state?: any) {
        rawParser(req, function (err, body) {
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

    return function jsonParser(req: http.IncomingMessage, callback: ParserCallback, state?: any) {
        rawParser(req, function (err, body) {
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
    
    return function anyBodyParser(req: http.IncomingMessage, callback: ParserCallback, state?: any) {
        if (handleRequestBodyAbsence(req, callback)) return;

        let t = typeis(req, types);
        switch (t) {
            case types[0]: {
                jsonParser(req, callback);
                break;
            }
            case types[1]: {
                formParser(req, callback);
                break;
            }
            default: {
                rawParser(req, callback);
            }
        }
    };
}

export function createAsyncParser(parser: Parser) {
    return function parse(req: http.IncomingMessage): Promise<any> {
        return new Promise((resolve, reject) => {
            parser(req, (err, body) => {
                if (err) {
                    let errObj;
                    if (isHttpError(err)) {
                        errObj = err;
                    } else {
                        errObj = new httpError.BadRequest();
                        wrapError(errObj, err);
                    }
                    reject(errObj);
                } else {
                    resolve(body);
                }
            });
        });
    }
}

export function parseBody<T>(req: http.IncomingMessage, parser: Parser = anyBodyParserFactory({})) {
    let finalParser = createAsyncParser(parser);
    return finalParser(req) as Promise<T>;
}

export function handleRequestBodyAbsence(req: http.IncomingMessage, callback: ParserCallback) {
    if (!typeis.hasBody(req)) {
        callback(null, null);
        return true;
    }
    return false;
}