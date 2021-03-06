import * as http from "http";
import * as rawBody from "raw-body";
import * as qs from "querystring";
import * as typeis from "type-is";
import * as contentType from "content-type";
import * as mimeTypes from "mime-types";
import * as httpError from "http-errors";
import * as stream from "stream";
import * as zlib from "zlib";
import * as onfinished from "on-finished";
import { intoHttpError } from "./error-utils";

export type ParserCallback = (error: rawBody.RawBodyError, body?: string | Buffer) => void;
export type Parser = (req: http.IncomingMessage, callback: ParserCallback, opts? : any) => void;
const defaultLimit = 1024 * 1024 / 2; // 512Kb

export function rawBodyParserFactory() {
    return function rawParser(req: http.IncomingMessage, callback: ParserCallback, opts?: any) {
        if (handleRequestBodyAbsence(req, callback)) return;

        let limit: number, contentLength: number,
            encoding: rawBody.Encoding,
            defaultEncoding: string;
        
        if (opts) {
            limit = opts.limit;
            contentLength = opts.length;
            encoding = opts.encoding;
            defaultEncoding = opts.defaultEncoding;
        }

        limit = limit || defaultLimit;

        if (encoding === undefined) {
            let contentTypeHeader = req.headers["content-type"] as string;
            // Ensure that further attempts are skipped, as contentType
            // will throw on invalid header. Since rawParser could 
            // potentially be passed on it's own to get a buffer back.
            if (contentTypeHeader) {
                try {
                    let ct = contentType.parse(contentTypeHeader);
                    encoding = ct.parameters["charset"] as any;
                    if (!encoding) {
                        // No valid encoding was found, but content-type
                        // header is valid. So, pick up the default 
                        // encoding for the mime.
                        let mimeCharset = mimeTypes.charset(ct.type);
                        encoding = mimeCharset ? mimeCharset : undefined;
                    }
                } catch (err) {
                    throw intoHttpError(err, 400);
                }
            }
        }

        if (encoding === undefined)
            encoding = defaultEncoding;

        rawBody(req, {
            limit: limit,
            length: contentLength,
            encoding,
        }, callback);
    };
}

export type JsonBodyParserOpts = rawBody.Options & { reviver?: (key: any, value: any) => any };

export function jsonBodyParserFactory(opts: JsonBodyParserOpts, baseParser?: Parser) {
    let rawParser = baseParser || rawBodyParserFactory();
    let reviver = opts ? opts.reviver : undefined;

    return function jsonParser(req: http.IncomingMessage, callback: ParserCallback, baseParserOpts?: any) {
        rawParser(req, function (err, body) {
            if (err) {
                return callback(err);
            }
            let res;
            try {
                if (typeof body !== "string")
                    throw new Error("buffered raw body is not a string to parse as json");
                res = JSON.parse(body, reviver);
            } catch (e) {
                return callback(e);
            }
            callback(null, res);
        }, baseParserOpts);
    };
}

export type FormBodyParserOpts = rawBody.Options & {
    parser?: (str: string, sep?: string, eq?: string, options?: qs.ParseOptions) => any;
    sep?: string;
    eq?: string;
    options?: qs.ParseOptions;
};

export function formBodyParserFactory(opts: FormBodyParserOpts, baseParser?: Parser) {
    let rawParser = baseParser || rawBodyParserFactory();
    let qsParse: any, sep: string, eq: string, options: qs.ParseOptions;
    
    if (opts) {
        qsParse = opts.parser;
        sep = opts.sep;
        eq = opts.eq;
        options = opts.options;
    }
    qsParse = qsParse || qs.parse;

    return function formBodyParser(req: http.IncomingMessage, callback: ParserCallback, baseParserOpts?: any) {
        let baseOpts = baseParserOpts;
        // TODO: Not very happy with the implementation here, for passing override opts to 
        // the raw parser. It works, however, could be better designed.
        if (baseOpts == null || baseOpts.defaultEncoding === undefined) {
            // It's important to pass in the default encoding as 'utf-8', 
            // since, mime-types don't resolve the default charset for 
            // `application/x-www-form-urlencoded`
            // TODO: Default charset Latin-1?
            baseOpts = Object.assign({}, baseOpts, { defaultEncoding: "utf-8" });
        }
        rawParser(req, function (err, body) {
            if (err) {
                return callback(err);
            }
            let res;
            try {
                if (typeof body !== "string")
                    throw new Error("buffered raw body is not a string to parse as url encoded form");
                // TODO: How to handle charset?
                res = qsParse(body, sep, eq, options);
            } catch (e) {
                return callback(e);
            }
            callback(null, res);
        }, baseOpts);
    };
}

export type AnyParserOptions = FormBodyParserOpts & JsonBodyParserOpts;  

export function anyBodyParserFactory(opts?: AnyParserOptions, baseParser?: Parser) {
    let rawParser = baseParser || rawBodyParserFactory();
    let jsonParser = jsonBodyParserFactory(opts, rawParser);
    let formParser = formBodyParserFactory(opts, rawParser);
    
    // Note: "text" type is also automatically handled by the rawParser
    // when content-type is set appropriately.
    let types = ["json", "urlencoded"];
    
    return function anyBodyParser(req: http.IncomingMessage, callback: ParserCallback, baseParserOpts?: any) {
        if (handleRequestBodyAbsence(req, callback)) return;
        
        let t = typeis(req, types);
        switch (t) {
            case types[0]: {
                jsonParser(req, callback, baseParserOpts);
                break;
            }
            case types[1]: {
                formParser(req, callback, baseParserOpts);
                break;
            }
            default: {
                rawParser(req, callback, baseParserOpts);
            }
        }
    };
}

export function createAsyncParser(parser: Parser) {
    return function parse(req: http.IncomingMessage, opts?: any): Promise<any> {
        return new Promise((resolve, reject) => {
            parser(req, (err, body) => {
                if (err) {
                    reject(intoHttpError(err, 400));
                } else {
                    resolve(body);
                }
            }, opts);
        });
    }
}

export function parseBody<T>(req: http.IncomingMessage, opts?: any, parser: Parser = anyBodyParserFactory()) {
    let finalParser = createAsyncParser(parser);
    return finalParser(req, opts) as Promise<T>;
}

export function handleRequestBodyAbsence(req: http.IncomingMessage, callback: ParserCallback) {
    if (!hasBody(req)) {
        callback(null, null);
        return true;
    }
    return false;
}

export function hasBody(req: http.IncomingMessage) {
    let headers = req.headers;
    if (headers["transfer-encoding"] !== undefined) return true;
    let contentLength = headers["content-length"];
    if (contentLength && Number(contentLength) > 0) return true;
    return false;
}

export function makeContentStream(req: http.IncomingMessage, encoding: string) {
    if (!encoding) return req;
    let stream: any;
    switch (encoding) {
        case "deflate":
            stream = zlib.createInflate();
            req.pipe(stream);
            break;
        case "gzip":
            stream = zlib.createGunzip();
            req.pipe(stream);
            break;
        case "identity":
            stream = req;
            break;
        default:
            throw httpError(415, 'unsupported content encoding "' + encoding + '"', { encoding });
    }
    if (stream != req) {
        stream.headers = req.headers;
    }
    return stream;
}