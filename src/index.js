var express = require('express');
var pug = require('pug');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
require('dotenv').config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var inbound = require('./routes/inbound');
var messenger = require('./routes/messenger');

var app = express();

// Pug Setup
app.set('views', './src/views');
app.set('view engine', 'pug');

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
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
});


app.listen(process.env.PORT, function () {
  console.log(`Example app listening on port ${process.env.PORT}!`)
});
