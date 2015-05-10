var express = require('express');
var bodyParser = require('body-parser');
var sqlite3 = require('sqlite3');
var expressJwt = require('express-jwt');
var jwt = require('jsonwebtoken');
var forge = require('node-forge');

var db = new sqlite3.Database('db/excuses.db');
var secrets = require('./secrets.json');

var twilioclient = require('twilio')(secrets.TWILIO_ACCT_SID, secrets.TWILIO_AUTH_TOKEN);

var app = express();


// any route prefixed with api will be authenticated
app.use('/api',expressJwt({secret:secrets.jwt}));
app.use(bodyParser.json({extended: false}));
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static('public'));

// deal with jwt unauthorized sessions without spamming the terminal
app.use(function (err, req, res, next) {
  if (err.name === 'UnauthorizedError') {
    res.status(401).send('invalid token...');
  }
});


// process alarms every 5 seconds
var alarminterval = setInterval(checkalarms, 5000);
function checkalarms() {
  var now = new Date().getTime();
  db.all("SELECT excuses.message, users.phone FROM alarms"
   +" JOIN users ON alarms.user_id = users.id"
   +" JOIN excuses ON alarms.excuse_id = excuses.id"
   +" WHERE time < ?", now, function(err,data) {
    if (data.length > 0) {
      // console.log(data);
      data.forEach(function(row) {

        // send off an sms for each alarm that just went off
        twilioclient.sendMessage({
          to: row.phone,
          from: secrets.TWILIO_PHONE_NO,
          body: row.message
        }, function(err,data) {
          if (err) {console.log(err);}
        });
      });
      db.run("DELETE FROM alarms WHERE time < ?", now, function(err) {
        if (err) throw(err);
      });
    }
  });
}

// receive text message
// match to our users and excuses, and set up an alarm in 5 minutes for their escape.
app.post('/textmessage', function(req,res) {
  var phone = req.body.From.slice(2); //chop off the leading +1
  db.get("SELECT id FROM users WHERE phone = ?", phone, function(err,userdata) {
    if (err) throw(err);
    // make sure this phone number has an account tied to it
    if (typeof userdata !== 'undefined') {
      db.all("SELECT trigger,id FROM excuses", function(err,data) {
        if (err) throw(err);
        console.log(JSON.stringify(data));

        // find the trigger that matches earliest in the sms body
        var minindex = 0;
        var excuse_id = -1;
        data.forEach(function(row) {
          var i = req.body.Body.indexOf(row.trigger);
          console.log(JSON.stringify(row));
          console.log("i = "+i);
          if (i != -1 && (excuse_id === -1 || i < minindex)) {
            minindex = i;
            excuse_id = row.id;
          }
        });
        if (excuse_id > -1) {
          // we have a matching trigger so add our alarm
          console.log("added alarm");
          db.run("INSERT INTO alarms (time,excuse_id,user_id) VALUES (?,?,?)", new Date().getTime()+5*60*1000, excuse_id, userdata.id, function(err) {
            if (err) throw(err);
            res.end();
          });
        } else {
          // behavior for no matching triggers goes here. currently we just ignore those texts.
          res.end();
        }
      });
    } else {
      res.status(401).send("No matching account for "+phone);
    }
  });
});

app.get('/', function(req,res) {
  res.render('index.html');
});

// ajax excuses list for populating forms
app.get('/api/excuses', function(req,res) {
  db.all("SELECT * FROM excuses", function(err,data) {
    if(err) throw(err);
    res.json(data);
  });
});

// ajax alarm list for logged in user
app.get('/api/alarms', function(req,res) {
  db.all("SELECT alarms.id,time,excuses.title,excuses.message FROM alarms JOIN excuses ON alarms.excuse_id = excuses.id WHERE user_id = ?", req.user.id, function(err,data) {
    if(err) throw(err);
    res.json(data);
  });
});

// set alarm
app.post('/api/alarms', function(req,res) {
  db.run("INSERT INTO alarms (time,excuse_id,user_id) VALUES (?,?,?)", req.body.time, req.body.excuse_id, req.user.id, function(err) {
    if (err) throw(err);
    res.end();
  });
});

app.delete('/api/alarm/:id', function(req,res) {
  db.run("DELETE FROM alarms WHERE id = ?", req.params.id, function(err) {
    if (err) throw(err);
    res.end();
  });
});

// ajax user data
app.get('/api/user', function(req,res) {
  db.get("SELECT name,email,phone FROM users WHERE id = ?", req.user.id, function(err,data) {
    if (err) throw(err);
    res.json({user: data});
  });
});

// add a new user
app.post('/users', function(req,res) {
  //ensure nobody else has that email or phone
  db.get("SELECT email FROM users WHERE email = ?", req.body.email, function(err,data) {
    if (typeof data !== 'undefined') {
      res.status(401).send("Email already tied to an account");
    } else {
      var phone = req.body.phone.replace(/[^0-9]/g,'');
      if (phone.length !== 10) {
        res.status(401).send("Need 10 digit phone number");
      } else {
        db.get("SELECT phone FROM users WHERE phone = ?", req.body.phone, function(err,data) {
          if (typeof data !== 'undefined') {
            res.status(401).send("Phone already tied to an account");
          } else {

            // email and phone are free so proceed

            // salt and hash password using sha256
            var md = forge.md.sha256.create();
            var salt = forge.random.getBytesSync(16);
            md.update(req.body.password + salt);

            // add the user to the db
            db.run("INSERT INTO users (name,phone,email,password,salt) VALUES (?,?,?,?,?)", req.body.name, phone, req.body.email, md.digest().toHex(), salt, function(err) {
              if (err) throw(err);
              db.get("SELECT * FROM users WHERE ROWID = ?", this.lastID, function(err,data) {
                if (err) throw(err);
                res.json(data);
              });
            });
          }
        });
      }
    }
  });
});

// ajax test if session is valid
app.get('/api/checksession', function(req,res) {
  res.end();
});


// user login
app.post('/authenticate', function(req,res) {
  db.get("SELECT * FROM users WHERE email = ?", req.body.email, function(err,data) {
    if (err) throw(err);
    if (typeof data === 'undefined') {
      res.status(401).send('User doesn\'t exist');
    } else {
      var md = forge.md.sha256.create();
      if (data.password === md.update(req.body.password + data.salt).digest().toHex()) {
        //passwords match
        var profile = {
          name: data.name,
          email: data.email,
          phone: data.phone,
          id: data.id
        }
        var token = jwt.sign(profile,secrets.jwt, {expiresInMinutes:60*5});
        res.json({token:token});
      } else {
        //passwords don't match
        res.status(401).send('Wrong password');
      }
    }
  });
});

app.listen(3000, function(){console.log("listening to port 3000")});
