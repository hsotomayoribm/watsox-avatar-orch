import * as dotenv from 'dotenv';

const PRODUCTION = process.env.NODE_ENV === 'production';

export class Config {

    public express: any;
    public serverAddress: string;
    public production: boolean;

    constructor() {
        // load environment variables
        dotenv.config();

        this.express = {
            port: process.env.EXPRESS_PORT || 3000,
            ip: process.env.EXPRESS_SERVER || '127.0.0.1'
        }
        this.production=PRODUCTION;

        if (PRODUCTION) {
            // for example
            this.express.ip = '0.0.0.0';
            this.express.port = 8080;
        }
    }

}

export default new Config();
