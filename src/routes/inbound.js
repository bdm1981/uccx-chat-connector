var express = require('express');
var router = express.Router();
var request = require('request');
var chat = require('../modules/chat');
require('dotenv').config();

router.get('/', function(req, res){
  console.log('request received');
  //res.sendStatus(200);
  res.render('chatform', {title: 'Webchat form', message: 'hello world!'});
});

router.post('/submit', function(req, res){
  chat.Submit(req.body)
  .then(function(uccxCookie){
    chat.sessions.push({
      uccxSession: uccxCookie,
      fbSession: null,
      status: 'waiting',
      holding: null,
      PresenceEvent: 1,
      from: null,
      MessageEventID: 1
    });
    return chat.Events({
      server: process.env.UCCX,
      uccxSession: uccxCookie,
      qs: `0&all=true&${Date.now()}`
    });
  });
  res.sendStatus(200);
});


module.exports = router;
