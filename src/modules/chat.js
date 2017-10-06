require('dotenv').config({path: __dirname + '/.env'});
const request = require('request');
const Promise = require('bluebird');
const parse = require('xml2json');
const _ = require('lodash');

var chat = module.exports = {

  // active chat sessions will be stored here
  sessions: [],

  Submit: function(fields){
    return new Promise(function(resolve, reject){
      var j = request.jar();
      request({
        jar: j,
        method: 'GET',
        url: `${process.env.SM}/ccp/chat/${process.env.UCCXFORM}/redirect`,
        headers: {
          connection: 'keep-alive',
          'upgrade-insecure-requests': '1',
          'accept-language': 'en-US,en;q=0.8',
          'accept-encoding': 'gzip, deflate, br'
        },
        qs: fields
      }, function(error, response){
        if(error){
          console.error(error);
          reject(error);
        }
        // resolve promise with the cookie containing the sessionID
        resolve(response.request.headers.cookie);
      });
    });
  },

  Events: function(params){
    return new Promise(function(resolve, reject){
      var j = request.jar();
      request({
        jar: j,
        method: 'GET',
        url: `${process.env.SM}/ccp/chat?eventid=${params.qs}`,
        headers: {
          connection: 'keep-alive',
          'x-requested-with': 'XMLHttpRequest',
          referer: `${process.env.SM}/ccp/ui/chat.jsp`,
          accept: 'application/xml, text/xml, */*; q=0.01',
          'content-type': 'application/xml; charset=utf-8',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
          'accept-language': 'en-US,en;q=0.8',
          'accept-encoding': 'gzip, deflate, br',
          cookie: params.uccxSession
        }
      }, function(error, response){
        if(error){
          console.error(error);
          reject(error);
        }else{
          resolve(response.body);
        }
      });
    });
  },

  Send: function(params){
    console.log('sending a message');
    params.message = stripNonValidXMLCharacters(params.message);
    return new Promise(function(resolve, reject){
      request({
        method: 'PUT',
        url: `${process.env.SM}/ccp/chat`,
        headers: {
          connection: 'keep-alive',
          'x-requested-with': 'XMLHttpRequest',
          referer: `${process.env.SM}/ccp/ui/chat.jsp`,
          accept: 'application/xml, text/xml, */*; q=0.01',
          'content-type': 'application/xml; charset=utf-8',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
          'accept-language': 'en-US,en;q=0.8',
          'accept-encoding': 'gzip, deflate, br',
          cookie: params.uccxSession
        }, 
        body: `<Message><body>${params.message}</body></Message>`
      }, function(error, response){
        if(error){
          reject(error);
        }else{
          resolve();
        }
      });
    });
  },

  SendToFB: function(params){
    var messageData = {
      recipient: {
        id: params.recipientId
      },
      message: {
        text: params.messageText
      }
    };

    return new Promise(function(resolve, reject){
      request({
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: process.env.FBTOKEN },
        method: 'POST',
        json: messageData

      }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
          var recipientId = body.recipient_id;
          var messageId = body.message_id;
          resolve();

        } else {
          console.error("Unable to send message.");
          console.error(response);
          console.error(error);
          reject()
        }
      });  
    })
  },
  
  Lookup: function(lookupID){
    console.log('lookup id: ', lookupID);
    for(var i = 0; i < this.sessions.length; i++){
      if(this.sessions[i].fbSession == lookupID){
        return i;
      }
    }
    return null;
  }
};

var parseEvent = function(event, x){
  return new Promise(function(resolve, reject){
    event = JSON.parse(parse.toJson(event));

    if(event.apiErrors){
      console.log(JSON.stringify(event, null, 2));
      if(event.apiErrors.apiError.errorType == 'notFound'){
        console.log('session timed out. removing from active session array');
        chat.SendToFB({
          recipientId: chat.sessions[x].fbSession,
          messageText: process.env.TIMEOUT
        }).then(function(){
          chat.sessions.splice(x, 1);
          resolve();
        });
      }
      resolve();
    }

    if(_.isEmpty(event.chatEvents)){
      resolve();
    }else if(event.chatEvents.StatusEvent && event.chatEvents.StatusEvent.status.length > 0 ){
      if(event.chatEvents.StatusEvent.status == 'chat_timedout_waiting_for_agent'){
        chat.SendToFB({
          recipientId: chat.sessions[x].fbSession,
          messageText: process.env.NOAGENTS
        }).then(function(){
          chat.sessions.splice(x, 1);
          resolve();
        });
      }
    }

    // check for new Presecence events joined, left, etc
    if(event.chatEvents.PresenceEvent && event.chatEvents.PresenceEvent.id != chat.sessions[x].PresenceEvent){
      console.log('Presense Update', event.chatEvents.PresenceEvent.status);
      if(event.chatEvents.PresenceEvent.status == 'joined' && chat.sessions[x].holding){
        console.log('Step 3');
        // notify FB user who they are connected to
        chat.SendToFB({
          recipientId: chat.sessions[x].fbSession,
          messageText: process.env.CONNECTED+' '+ event.chatEvents.PresenceEvent.from
        }).then(function(){
          console.log('Step 4');
          return chat.Send({
            uccxSession: chat.sessions[x].uccxSession,
            message: chat.sessions[x].holding
          });
        }).then(function(){
          console.log('Step 5');
          chat.sessions[x].holding = null;
          chat.sessions[x].status = 'joined';
          chat.sessions[x].MessageEventID++;
          resolve();
        });
      }else if(event.chatEvents.PresenceEvent.status == 'left'){
        chat.SendToFB({
          recipientId: chat.sessions[x].fbSession,
          messageText: event.chatEvents.PresenceEvent.from+' '+process.env.ENDCHAT
        }).then(function(){
          chat.sessions.splice(x, 1);
          console.log(chat.sessions.length);
          resolve();
        });
      }
    }

    // Handling typing indicators
    if(Array.isArray(event.chatEvents.TypingEvent)){
      var eventIndex = event.chatEvents.TypingEvent.length - 1;
      if(chat.sessions[x].TypingEventID != event.chatEvents.TypingEvent[eventIndex].id){
        chat.sessions[x].TypingEventID = event.chatEvents.TypingEvent[eventIndex].id;
        chat.sessions[x].TypingStatus = event.chatEvents.TypingEvent[eventIndex].status;
        typingIndicator({
          id: chat.sessions[x].fbSession,
          state: event.chatEvents.TypingEvent[eventIndex].status
        }).then(function(){
          resolve();
        });
      }else{
        resolve();
      }
    }else if(event.chatEvents.TypingEvent && typeof event.chatEvents.TypingEvent.id != undefined){
      console.log('typing event');
      if(chat.sessions[x].TypingEventID != event.chatEvents.TypingEvent.id){
        console.log('new typing event');
        chat.sessions[x].TypingEventID = event.chatEvents.TypingEvent.id;
        chat.sessions[x].TypingStatus = event.chatEvents.TypingEvent.status;
        typingIndicator({
          id: chat.sessions[x].fbSession,
          state: event.chatEvents.TypingEvent.status
        }).then(function(){
          resolve();
        });
      }else{
        resolve();
      }
    }


    // check for Message events\
    var message = '';
    if(Array.isArray(event.chatEvents.MessageEvent)){
      for(var i = 0; i < event.chatEvents.MessageEvent.length; i++){
        message += event.chatEvents.MessageEvent[i].body + '\n';
      }

      chat.sessions[x].MessageEventID  = event.chatEvents.MessageEvent[(i-1)].id;
      chat.SendToFB({
        recipientId: chat.sessions[x].fbSession,
        messageText: message
      }).then(function(){
        resolve();
      });
    }else{
      if(event.chatEvents.MessageEvent && event.chatEvents.MessageEvent.id != chat.sessions[x].MessageEventID){
        message = urldecode(event.chatEvents.MessageEvent.body);
        chat.sessions[x].MessageEventID = event.chatEvents.MessageEvent.id;
        chat.SendToFB({
          recipientId: chat.sessions[x].fbSession,
          messageText: message
        }).then(function(){
          resolve();
        })    
      }    
    }
  });
};

function poll(i){
  if(chat.sessions.length){
    var total = (chat.sessions.length - 1);

    var processChat = function(x){
      if(x <= total){
        // console.log(`INDEX: ${x}`);
        console.log(`Step 1: ${chat.sessions[x].uccxSession} index ${x}`);
        chat.Events({
          server: process.env.SM,
          uccxSession: chat.sessions[x].uccxSession,
          qs: chat.sessions[x].MessageEventID
        })
        .then(function(event){
          console.log(event);
          return parseEvent(event, x);
        })
        .then(function(){
          console.log(`Done: ${x}`);
          processChat(x+1);
        })
        .catch(function(error){
          console.log('oops! '+ error);
          processChat(x+1);
        });
      };
    };    
    // process first chat message
    processChat(i);
  };
};

function typingIndicator(params){
  var state;
  switch(params.state){
    case 'paused':
      state = 'typing_off'
      break;
    case 'composing':
      state = 'typing_on'
      break;
    default:
      state = 'typing_off'
      break;
  }
  return new Promise(function(resolve, reject){
    request({
      uri: 'https://graph.facebook.com/v2.6/me/messages',
      qs: { access_token: process.env.FBTOKEN },
      method: 'POST',
      headers: 
       { 'cache-control': 'no-cache',
         'content-type': 'application/json' },
      body: { recipient: { id: params.id }, sender_action: state },
      json: true
    }, function(error, response, body){
      if(error){
        reject(error);
      }else{
        resolve();
      }
    });
  })
}

// decode messages
function urldecode(message) {
  return decodeURIComponent(message.replace(/\+/g, ' '));
};

// strip invalid xml characters including gifs, images, emojis, etc
function stripNonValidXMLCharacters(text){ 
  var out = []; // Used to hold the output.
  if (!text  || text === '') 
      return ''; 

    for ( var i = 0; i < text.length; i++) {
        var current = text.charCodeAt(i); 
        if ((current == 0x9) ||
            (current == 0xA) ||
            (current == 0xD) ||
            ((current >= 0x20) && (current <= 0xD7FF)) ||
            ((current >= 0xE000) && (current <= 0xFFFD)) ||
            ((current >= 0x10000) && (current <= 0x10FFFF)))
          out.push(text.charAt(i));
    }
    return out.join("");
};

setInterval(function(){
  poll(0);
}, 5000);