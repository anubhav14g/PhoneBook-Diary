// to add environment file to save private data
require('dotenv').config();

const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
// for sms
const Nexmo = require('nexmo');
// image uploading
const multer = require('multer');
const path = require('path');
const puppeteer = require('puppeteer')
const mustacheExpress = require('mustache-express');

const nexmo = new Nexmo({
  apiKey: "6982052c",
  apiSecret: "yBziy0vnEu0HbBuO",
});

// adding cookies and sessions
const request = require("request");
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');

const app = express();
// app.engine('ejs', mustacheExpress());
app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(express.static("public"));

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, __dirname + '/public/stores/images');
  },

  // By default, multer removes file extensions so let's add them back
  filename: function(req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
}).single('photo');

// configuring session to save cookies
app.use(session({
  secret: "ThisIsTheSecretOfAnubhav",
  resave: false,
  saveUninitialized: true,
}));

// use passport to initialize session to work
app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb://localhost:27017/contactsDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true
},()=> console.log('Successfully connected to local database'));

// mongoose.connect("mongodb+srv://admin-anubhavg:T-0101@myfirstdatabase.ewcnv.mongodb.net/contactsDB",
// {useNewUrlParser:true,
// useUnifiedTopology:true},
// ()=> console.log('Successfully connected to cloud database'));

mongoose.set('useCreateIndex', true);
mongoose.set('useFindAndModify', false);

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  array: [{
    name: String,
    phone: String,
    email: String,
    image: String
  }]
});

userSchema.plugin(passportLocalMongoose);

const User = mongoose.model("User", userSchema);
// const Image=mongoose.model("Image",imageSchema);

// using passport-local-mongoose to serialze and deserialize
passport.use(User.createStrategy());
passport.serializeUser(function(user, done) {
  done(null, user.id);
});
passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

app.get("/home", function(req, res) {
  // res.render("loader");
  res.render("home");
});

app.get("/", function(req, res) {
  // res.render("home");
  res.render("loader");
});

app.get("/login", function(req, res) {
  res.render("login");
});

app.get("/register", function(req, res) {
  res.render("register");
});

app.get("/secrets", function(req, res) {
  User.findById(req.user.id, function(err, foundUsers) {
    if (!err) {
      if (foundUsers) {
        res.render("secrets", {
          usersWithSecrets: foundUsers
        });
      }
    }
  });
});

app.get('/export/data/:user_id', (req, res) => {
    User.findById(req.params.user_id, function(err, foundUsers) {
      if (!err) {
        if (foundUsers) {
          res.render("secretsPdf", {
            usersWithSecrets: foundUsers
          });
        }
      }
    });
});

app.get("/Createpdf", async function(req, res) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/export/data/'+req.user.id,{waitUntil: 'networkidle0'});
  // await page.pdf({path: __dirname + '/public/pdf/medium.pdf', format: 'A4'});
  const buffer = await page.pdf({format: 'A4'});
  res.type('application/pdf');
  res.send(buffer);
  await browser.close();
  console.log("pdf created successfully");
});

app.post("/screenshot", async function(req, res) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(req.body.url,{waitUntil: 'networkidle0'});
  const buffer = await page.screenshot({fullPage : true});
  res.set('Content-Type', 'image/png');
  res.send(buffer);
  await browser.close();
  console.log("screenshot taken successfully");
});

app.get("/submit", function(req, res) {
  if (req.isAuthenticated()) {
    res.render("submit");
  } else {
    res.redirect("/login");
  }
});

app.post("/sms", function(req, res) {
  const from = req.body.from;
  const to = req.body.phoneno;
  const text = req.body.message;

  nexmo.message.sendSms(from, to, text, (err, responseData) => {
    if (err) {
      console.log(err);
    } else {
      if (responseData.messages[0]['status'] === "0") {
        console.log("Message sent successfully.");
      } else {
        console.log(`Message failed with error: ${responseData.messages[0]['error-text']}`);
      }
    }
  })
  res.redirect("/secrets");
});

app.post('/upload', upload, (req, res) => {
  if (req.file) {
    res.json(req.file);
  } else throw 'error';
});

app.post("/submit", upload, function(req, res) {
  const name = req.body.name;
  const phone = req.body.phone;
  const email = req.body.email;
  const image = req.file.filename;
  const add = {
    name: name,
    phone: phone,
    email: email,
    image: image
  };

  //Once the user is authenticated and their session gets saved,
  // their user details are saved to req.user.id

  User.findById(req.user.id, function(err, foundUser) {
    if (!err) {
      if (foundUser) {
        foundUser.array.push(add);
        foundUser.save(function() {
          res.redirect("/secrets");
        });
      }
    } else {
      console.log(err);
    }
  });
});

app.post("/delete", function(req, res) {

  const delItem = req.body.check;
  User.updateOne({
    _id: req.user.id
  }, {
    $pull: {
      array: {
        _id: delItem
      }
    }
  }, function(err, data) {
    if (err) {
      console.log(err);
    } else {
      res.redirect("/secrets");
    }
  });
});

app.get("/logout", function(req, res) {
  req.logout();
  res.redirect("/");
});

app.post("/register", function(req, res) {
  User.register({
    username: req.body.username
  }, req.body.password, function(err, user) {
    if (err) {
      res.redirect("/register");
    } else {
      passport.authenticate("local")(req, res, function() {
        res.render("success-register");
      });
    }
  });
});

app.post("/login", function(req, res) {
  const user = new User({
    username: req.body.username,
    password: req.body.password
  });
  req.login(user, function(err) {
    if (!err) {
      passport.authenticate("local")(req, res, function() {
        res.redirect("/secrets");
      });
    }
  });
});


app.listen(process.env.PORT || 3000, function() {
  console.log("Server started on port 3000");
});
