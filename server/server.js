const express = require("express");
const multer = require("multer");
const AWS = require("aws-sdk");
const mysql = require("mysql2");
const dotenv = require('dotenv');

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });
dotenv.config({ path: './config.env' })

const s3 = new AWS.S3({ region: process.env.AWS_REGION });
const BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION

const db = mysql.createConnection({
  host: process.env.DB_HOST, //"RDS_ENDPOINT",
  user: process.env.DB_USER, 
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

/* Enable Cors */
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, HEAD, OPTIONS, PUT, PATCH, DELETE",
  );
  res.header("Access-Control-Allow-Headers", "*");
  res.header(
    "Access-Control-Expose-Headers",
    "x-access-token, x-refresh-token, _id",
  );
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Methods", "PATCH, PUT, GET, POST, DELETE");
    return res.status(200).json({});
  }
  next();
});
// Connect to the database
db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err.message);
    return;
  }
  console.log('Connected to the MySQL "aws-photos" database!');
});


app.get("/health", (req, res) => {
  db.query("SELECT 1 + 1 AS result", (err, results) => {
    if (err) return res.status(500).send(err.message);
    res.send(`Database is working! Result: ${results[0].result}`);
  });
});

app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    console.log("start of upload photos");
    const file = req.file;
    if (!file) return res.status(400).send("No file uploaded");
    const key = Date.now() + "-" + file.originalname;
    console.log("connecting to s3...");
    await s3
      .putObject({
        Bucket: BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: "public-read",
      })
      .promise();

    const url = `http://${BUCKET}.${S3_REGION}/${key}`;
    console.log("start of metadata upload to db");
    db.query(
      `INSERT INTO photos (filename, s3_key, url, size, mime_type)
   VALUES (?, ?, ?, ?, ?)`,
      [file.originalname, key, url, file.size, file.mimetype],
      (err) => {
        if (err) return res.status(500).send(err.message);

        res.json({
          success: true,
          url: url,
        });
      },
    );
    console.log("end of metadata upload to db");
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

app.get("/photos", async (req, res) => {
  console.log("start of get photos");
  db.query("SELECT * FROM photos", (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err.message);
    }
    console.log("end of get photos with payload: ", results);
    res.json(results);
  });
});

app.listen(port, () => {
  console.log("Server running");
});
