export declare class Server {
    private server;
    constructor();
    setupMiddleware(): void;
    run(port: number, host?: string): void;
}
