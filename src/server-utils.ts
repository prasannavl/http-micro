import * as net from "net";
import * as http from "http";
import * as https from "https";
import * as utils from "./utils";

const MicroServerKey = "micro";
const ShutdownKey = "shutdown";
const ClientErrorKey = "clientError";

export type MicroServer = MicroHttpServer | MicroHttpsServer;

export type MicroHttpServer = http.Server & MicroServerExtensions;
export type MicroHttpsServer = https.Server & MicroServerExtensions;

export type MicroServerExtensions = IShutdown & { micro: MicroExtensionContainer };

export type MicroExtensionContainer = {
    shutdownManager: ShutdownManager;
    clientErrorHandler: (err: any, socket: net.Socket) => void;
}

export function attachServerExtensions(
    server: http.Server | https.Server,
    socketErrorHandler?: (err: any, socket: net.Socket) => void) {
    let s = server as any;
    let micro = s[MicroServerKey];
    if (micro) throw new Error("server is already attached to a micro app");

    let sm = new ShutdownManager(server);
    let clientErrorHandler =
        socketErrorHandler || utils.defaultClientSocketErrorHandler;
    
    s[MicroServerKey] = {
        shutdownManager: sm,
        clientErrorHandler
    } as MicroExtensionContainer;

    s[ShutdownKey] = sm.shutdown.bind(sm);
    server.on(ClientErrorKey, clientErrorHandler);

    return server as MicroServer;
}

export function detachServerExtensions(server: http.Server | https.Server) {
    let s = server as any;
    const microKey = "micro";
    let micro = s[microKey] as MicroExtensionContainer;
    if (micro) {
        micro.shutdownManager.destroy();
        server.removeListener(ClientErrorKey, micro.clientErrorHandler);
        delete s[microKey];
        delete s[ShutdownKey];
    }
}

export interface IShutdown {
    shutdown: (gracePeriodMs?: number, callback?: Function) => void;
}

export type ShutdownListener = (isForcedExit: boolean) => void;

const ConnectionKey = "connection";
const SecureConnectionKey = "secureConnection";
const RequestKey = "request";
const CloseKey = "close";
const FinishKey = "finish";

export class ShutdownManager implements IShutdown {
    socketRequestCountMap = new Map<net.Socket, number>();
    shutdownRequested = false;

    private _shutdownListeners: ShutdownListener[] = null;

    private _onConnectionBound: (socket: net.Socket) => void = this._onConnection.bind(this);
    private _onRequestBound: (req: http.IncomingMessage, res: http.ServerResponse) => void = this._onRequest.bind(this);
    private _destroySocketsBound: () => void = this._destroySockets.bind(this);

    constructor(public server: http.Server | https.Server) {
        server.on(ConnectionKey, this._onConnectionBound);
        server.on(SecureConnectionKey, this._onConnectionBound);
        server.on(RequestKey, this._onRequestBound);
    }

    destroy() {
        this.server.removeListener(ConnectionKey, this._onConnectionBound);
        this.server.removeListener(SecureConnectionKey, this._onConnectionBound);
        this.server.removeListener(RequestKey, this._onRequestBound);
        this.socketRequestCountMap.clear();
        this._shutdownListeners = null;
    }

    shutdown(gracePeriodMs = Infinity, callback?: ShutdownListener) {
        // allow request handlers to update state before we act on that state
        setImmediate(() => {
            this.server.close(() => {
                if (callback) {
                    // Execute callback immediately is no request is pending, or schedule it.
                    if (this.socketRequestCountMap.size === 0) callback(false);
                    else this._pushListener(callback);
                }
            });
            this.shutdownRequested = true;
            if (gracePeriodMs < Infinity) {
                setTimeout(this._destroySocketsBound, gracePeriodMs).unref();
            }
            this.socketRequestCountMap.forEach((reqNum, socket) => {
                // End all idle connections (keep-alive, etc)
                if (reqNum === 0) socket.end();
            });
        });
    }

    private _onConnection(socket: net.Socket) {
        this.socketRequestCountMap.set(socket, 0);
        socket.once(CloseKey, () => this._onSocketClose(socket));
    }

    private _onSocketClose(socket: net.Socket) {
        let socketRequestCountMap = this.socketRequestCountMap;
        socketRequestCountMap.delete(socket);
        if (this.shutdownRequested && socketRequestCountMap.size === 0) {
            this._invokeAndResetShutdownListeners(false);
        }
    }

    private _invokeAndResetShutdownListeners(isForcedExit: boolean) {
        let listeners = this._shutdownListeners;
        if (listeners) {
            // reset shutdown listeners.
            this._shutdownListeners = null;
            let len = listeners.length;
            for (let i = 0; i < len; i++) listeners[i](isForcedExit);
        }
    }

    private _onRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        let socket = req.socket;
        let socketRequestCountMap = this.socketRequestCountMap;
        socketRequestCountMap.set(socket, socketRequestCountMap.get(socket) + 1);
        res.once(FinishKey, () => this._onResponseFinished(socket));
    }

    private _onResponseFinished(socket: net.Socket) {
        let socketRequestCountMap = this.socketRequestCountMap;
        let pending = socketRequestCountMap.get(socket) - 1;
        socketRequestCountMap.set(socket, pending);
        if (this.shutdownRequested && pending === 0) {
            socket.end();
        }
    }

    private _destroySockets() {
        // attempt to shutdown gracefully first.
        this.socketRequestCountMap.forEach((reqs, socket) => socket.end());
        // then destory them.
        setImmediate(() => {
            this.socketRequestCountMap.forEach((reqs, socket) => socket.destroy());
            // ensure that any pending callbacks are called.
            this._invokeAndResetShutdownListeners(true);
        });
    }

    private _pushListener(listener: ShutdownListener) {
        if (!this._shutdownListeners) this._shutdownListeners = [];
        this._shutdownListeners.push(listener);
    }
}
