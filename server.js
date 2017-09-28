var express = require("express");
var jwt = require("jsonwebtoken");
var sqlite3 = require("sqlite3");
var config = require("./config");

var app = express();

var port = process.env.PORT || 8080;

var db = new sqlite3.Database("peak.db");

function checkAnswer(problem, answer, guess) {
  return answer === guess;
}

db.run("CREATE TABLE IF NOT EXISTS users(user TEXT, password TEXT)");
db.run("CREATE TABLE IF NOT EXISTS problems(name TEXT, answer TEXT)");
db.run("CREATE TABLE IF NOT EXISTS guesses(team TEXT, name TEXT, guess TEXT, correct BOOLEAN, time TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");

app.get("/createTeam", function(req, res) {
  var user = req.query.user;
  var password = req.query.password;
  if (user === undefined || user === "") {
    res.send({
      "success": false,
      "message": "BLANK_USER"
    });
  } else if (password === undefined || password === "") {
    res.send({
      "success": false,
      "message": "BLANK_PASSWORD"
    });
  } else {
    db.all("SELECT user, password FROM users WHERE user = ?", [user], function(err, users) {
      if (users.length > 0) {
        res.send({
          "success": false,
          "message": "ACCOUNT_EXISTS"
        });
      } else {
        db.run("INSERT INTO users (user, password) VALUES(?, ?)", [user, password], function() {
          res.send({
            "success": true
          });
        });
      }
    });
  }
});

app.get("/login", function(req, res) {
  var user = req.query.user;
  var password = req.query.password;
  if (user === undefined || user === "") {
    res.send({
      "success": false,
      "message": "BLANK_USER"
    });
  } else if (password === undefined || password === "") {
    res.send({
      "success": false,
      "message": "BLANK_PASSWORD"
    });
  } else {
    db.all("SELECT user, password FROM users WHERE user = ?", [user], function(err, users) {
      if (users.length == 0) {
        res.send({
          "success": false,
          "message": "ACCOUNT_NOT_FOUND"
        });
      } else {
        if (users[0].password !== password) {
          res.send({
            "success": false,
            "message": "WRONG_PASSWORD"
          });
        } else {
          var payload = {
            "user": user
          };
          var token = jwt.sign(payload, config.secret, {
            expiresIn: "7d"
          });
          res.send({
            "success": true,
            "token": token
          });
        }
      }
    });
  }
});

var auth_router = express.Router();
auth_router.use(function(req, res, next) {
  var token = req.query.token;
  if (token) {
    jwt.verify(token, config.secret, function(err, decoded) {
      if (err) {
        res.send({
          "success": false,
          message: "TOKEN_FAILED"
        });
      } else {
        req.decoded = decoded;
        next();
      }
    });
  } else {
    res.status(403).send({
      "success": false,
      "message": "TOKEN_EMPTY"
    });
  }
});

app.use("/", auth_router);

app.get("/getProblems", function(req, res) {
  db.all("SELECT name FROM problems", function(err, problems) {
    res.send(problems);
  });
});

app.get("/submitAnswer", function(req, res) {
  var name = req.query.name;
  var guess = req.query.guess;
  var team = req.decoded.user;
  if (name === undefined || name == "") {
    res.send({
      "success": false,
      "message": "BLANK_NAME"
    });
  } else if (guess === undefined || guess == "") {
    res.send({
      "success": false,
      "message": "BLANK_GUESS"
    });
  } else {
    db.all("SELECT name, answer FROM problems WHERE name = ?", [name], function(err, problems) {
      if (problems.length == 0) {
        res.send({
          "success": false,
          "message": "PROBLEM_NOT_FOUND"
        });
      } else {
        db.all("SELECT * FROM guesses WHERE name = ? AND correct = 1", [name], function(err, guesses) {
          if (guesses.length > 0) {
            res.send({
              "success": false,
              "message": "ALREADY_GUESSED"
            });
          } else {
            if (checkAnswer(name, problems[0].answer, guess)) {
              db.run("INSERT INTO guesses (team, name, guess, correct) VALUES(?, ?, ?, 1)", [team, name, guess], function() {
                res.send({
                  "success": true
                });
              });
            } else {
              db.run("INSERT INTO guesses (team, name, guess, correct) VALUES(?, ?, ?, 0)", [team, name, guess], function() {
                res.send({
                  "success": false,
                  "message": "WRONG_ANSWER"
                });
              });
            }
          }
        });
      }
    });
  }
});

app.get("/getMyGuesses", function(req, res) {
  var team = req.decoded.user;
  db.all("SELECT * FROM guesses WHERE team = ?", [team], function(err, guesses) {
    res.send(guesses);
  });
});

app.get("/getScores", function(req, res) {
  db.all("SELECT team, COUNT(team) as guesses, SUM(correct) as score FROM guesses GROUP BY team", function(err, scores) {
    res.send(scores);
  });
});

var admin_router = express.Router();

admin_router.use(function(req, res, next) {
  if (req.decoded.user !== "admin") {
    res.status(403).send({
      "success": false,
      "message": "NOT_ADMIN"
    });
  } else {
    next();
  }
});

app.use("/", admin_router);

app.get("/getTeams", function(req, res) {
  db.all("SELECT name, password FROM users", function(err, users) {
    res.send(users);
  });
});

app.get("/createProblem", function(req, res) {
  var name = req.query.name;
  var answer = req.query.answer;
  if (name === undefined || name == "") {
    res.send({
      "success": false,
      "message": "BLANK_NAME"
    });
  } else if (answer === undefined || answer == "") {
    res.send({
      "success": false,
      "message": "BLANK_ANSWER"
    });
  } else {
    db.all("SELECT name, answer FROM problems WHERE name = ?", [name], function(err, problems) {
      if (problems.length > 0) {
        res.send({
          "success": false,
          "message": "PROBLEM_EXISTS"
        });
      } else {
        db.run("INSERT INTO problems (name, answer) VALUES(?, ?)", [name, answer], function() {
          res.send({
            "success": true
          });
        });
      }
    });
  }
});

app.get("/getProblemsAdmin", function(req, res) {
  db.all("SELECT name, answer FROM problems", function(err, problems) {
    res.send(problems);
  });
});

app.get("/getAllGuesses", function(req, res) {
  var team = req.decoded.user;
  db.all("SELECT * FROM guesses", function(err, guesses) {
    res.send(guesses);
  });
});

app.listen(port);
console.log("Listen at http://localhost:" + port);