var express = require('express');
var router = express.Router();
require('dotenv').config();
var request = require('request');
var chat = require('../modules/chat');


var qs = { 
 subject: 'Super4G Contact Form',
 recipient: 'facebook@dcloud.cisco.com',
 extensionField_Name: '',
 extensionField_Email: '',
 extensionField_PhoneNumber: '',
 extensionField_AddressLine1: '',
 extensionField_Model: '',
 extensionField_ccxqueuetag: process.env.CSQ,
 author: 'Customer',
 title: 'Facebook Messenger',
};

// used to validate the FB Messenger Webhook
router.get('/', function(req, res) {
  console.log('webhook called');
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === 'helloMessenger!') {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);          
  }  
});


router.post('/', function (req, res) {
  var data = req.body;
  console.log('yes we have data!', data);
  console.log('FB data: ', JSON.stringify(data, null, 2));

  // Make sure this is a page subscription
  if (data.object === 'page') {

    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
      var pageID = entry.id;
      var timeOfEvent = entry.time;

      // Check to see if an existing conversation is present
      var index = chat.Lookup(data.entry[0].messaging[0].sender.id);
      
      if(index == null){
        
        // Iterate over each messaging event
        entry.messaging.forEach(function(event) {
          if (event.message) {
            // console.log('Step 1: got a new message');
            fbUserInfo(data.entry[0].messaging[0].sender.id)
            .then(function(userInfo){
              userInfo = JSON.parse(userInfo);
              // console.log('Step 2: ', userInfo)
              qs.author = `${userInfo.first_name} ${userInfo.last_name}`;
              return chat.Submit(qs);
            })
            .then(function(uccxCookie){
              // console.log('Step 3:', uccxCookie);
              // Add the new chat session to an array
              chat.sessions.push({
                uccxSession: uccxCookie,
                fbSession: data.entry[0].messaging[0].sender.id,
                fbSenderId: data.entry[0].messaging[0].recipient.id,
                status: 'waiting',
                holding: event.message.text,
                PresenceEvent: 1,
                from: null,
                MessageEventID: 1,
                TypingEventID: null,
                TypingStatus: null
              });
              return chat.Events({
                uccxSession: uccxCookie,
                qs: `0&all=true&${Date.now()}`
              });
            }).then(function(eventOutput){
              // console.log('Step 4: ', eventOutput);
              chat.SendToFB({
                senderId: data.entry[0].messaging[0].recipient.id,
                recipientId: data.entry[0].messaging[0].sender.id,
                messageText: process.env.WAITING
              }).then(function(){
                // console.log('Step 5: done');
                res.sendStatus(200);  
              })
            })
          } else {
            console.log("Webhook received unknown event: ", event);
          }
        });
      }else{
        console.log('convo already exists');
        entry.messaging.forEach(function(event) {
          if(event.message){
            //console.log(event.message.text);
            chat.Send({
              uccxSession: chat.sessions[index].uccxSession,
              message: event.message.text 
            });
          }
        });
        
        res.sendStatus(200);
      }
    });
  }
});

module.exports = router;

var fbUserInfo = function(userID){
  return new Promise(function(resolve, reject){
    request({
      method: 'GET',
      url: `https://graph.facebook.com/v2.6/${userID}?fields=first_name,last_name&access_token=${process.env.FBTOKEN}`,
      headers: {
        'content-type': 'application/json'
      }
    }, function(error, response){
      if(error){
        reject(error);
      }else{
        resolve(response.body);
      }
    })
  });
};
