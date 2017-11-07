var express = require('express');
var https = require('https');
var fs = require('fs');
var path = require('path');
var localtunnel = require('localtunnel');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
require('dotenv').config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var inbound = require('./routes/inbound');
var messenger = require('./routes/messenger');

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/inbound', inbound);
app.use('/messenger', messenger);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res) {
    res.status(err.status || 500);
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res) {
  res.status(err.status || 500);
});


if(process.env.SECURE === '1'){
  var options = {
    key: fs.readFileSync(path.join(__dirname, '../cert', process.env.KEY)),
    cert: fs.readFileSync(path.join(__dirname, '../cert', process.env.CERT))
  };

  https.createServer(options, app).listen(process.env.PORT, function(){
    console.log(`UCCX Connector listening on https://localhost:${process.env.PORT}`);
    console.log(`UCCX Connector listening on https://<your domain>:${process.env.PORT}`);
  });
}else{
  app.listen(process.env.PORT, function (){
    console.log(`UCCX Connector listening on  http://localhost:${process.env.PORT}!`);
    console.log(`UCCX Connector listening on  http://localhost:${process.env.PORT}!`);
  });
}

// start localtunnel if enabled
if(process.env.LT === '1'){
  var tunnel = localtunnel(process.env.PORT, {subdomain: process.env.SUBDOMAIN}, function(err, tunnel){
    console.log('Localtunnel start: '+tunnel.url);
  }); 
}