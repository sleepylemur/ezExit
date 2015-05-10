var express = require('express');
var bodyParser = require('body-parser');
var sqlite3 = require('sqlite3');
var expressJwt = require('express-jwt');
var jwt = require('jsonwebtoken');
var forge = require('node-forge');

var db = new sqlite3.Database('db/excuses.db');
var secrets = require('./secrets.json');

var app = express();

// any route prefixed with api will be authenticated
app.use('/api',expressJwt({secret:secrets.jwt}));
app.use(bodyParser.json({extended: false}));
app.use(express.static('public'));


var alarminterval = setInterval(checkalarms, 5000);
function checkalarms() {
  var now = new Date().getTime();
  db.all("SELECT excuses.message, users.phone FROM alarms"
   +" JOIN users ON alarms.user_id = users.id"
   +" JOIN excuses ON alarms.excuse_id = excuses.id"
   +" WHERE time < ?", now, function(err,data) {
    if (data.length > 0) {
      console.log(data);
    }
  });
}

app.get('/api/excuses', function(req,res) {
  db.all("SELECT * FROM excuses", function(err,data) {
    if(err) throw(err);
    res.json(data);
  });
});

app.get('/api/alarms', function(req,res) {
  db.all("SELECT alarms.id,time,excuses.title,excuses.message FROM alarms JOIN excuses ON alarms.excuse_id = excuses.id WHERE user_id = ?", req.user.id, function(err,data) {
    if(err) throw(err);
    res.json(data);
  });
});

app.post('/api/alarms', function(req,res) {
  db.run("INSERT INTO alarms (time,excuse_id,user_id) VALUES (?,?,?)", req.body.time, req.body.excuse_id, req.user.id, function(err) {
    if (err) throw(err);
    res.end();
    // db.get("SELECT alarms.id,time,excuses.title,excuses.message FROM alarms JOIN excuses ON alarms.excuse_id = excuses.id WHERE alarms.ROWID = ?", this.lastID, function(err,data) {
    //   if (err) throw(err);
    //   res.json(data);
    // });
  });
});

app.delete('/api/alarm/:id', function(req,res) {
  db.run("DELETE FROM alarms WHERE id = ?", req.params.id, function(err) {
    if (err) throw(err);
    res.end();
  });
});

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

app.get('/api/checksession', function(req,res) {
  res.json(true);
});

app.get('/', function(req,res) {
  res.render('index.html');
});

app.get('/api/user', function(req,res) {
  db.get("SELECT name,email,phone FROM users WHERE id = ?", req.user.id, function(err,data) {
    if (err) throw(err);
    res.json({user: data});
  });
});

app.post('/users', function(req,res) {
  //ensure nobody else has that email
  db.get("SELECT email FROM users WHERE email = ?", req.body.email, function(err,data) {
    if (typeof data !== 'undefined') {
      res.status(401).send("Account already exists");
    } else {
      //email is free so proceed
      var md = forge.md.sha256.create();
      var salt = forge.random.getBytesSync(16);
      md.update(req.body.password + salt);

      db.run("INSERT INTO users (name,phone,email,password,salt) VALUES (?,?,?,?,?)", req.body.name, req.body.phone, req.body.email, md.digest().toHex(), salt, function(err) {
        if (err) throw(err);
        db.get("SELECT * FROM users WHERE ROWID = ?", this.lastID, function(err,data) {
          if (err) throw(err);
          res.json(data);
        });
      });
    }
  });
});

app.listen(3000);