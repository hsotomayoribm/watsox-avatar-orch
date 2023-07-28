import express = require('express');
import cors = require('cors');
// import bodyParser = require('body-parser');

class App {
  public app: express.Application;

  constructor() {
    this.app = express();
    this.config();
  }

  private config() {
    // support application/json
    this.app.use(express.json());
    this.app.use(cors());
    this.app.use(
      express.urlencoded({
        extended: true,
      })
    );
  }
}

export default new App().app;
