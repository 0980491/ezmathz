var tempResult = 1.01;

function doMath(a, b, c) {
  switch (a) {
    case "+":
      return b + c;
    case "-":
      return b - c;
    case "‧":
      return b * c;
  }
}

function submitAnswer(result) {
  document.querySelector("#mathForm").addEventListener("submit", function(e) {
    e.preventDefault();
    var userAnswer = document.querySelector("#answerInput").value;
    var bool = (result == userAnswer) ? true : false;

    if (bool === true) {
      var op = 1;
      over(op)
    } else {
      var op = 0;
      over(op)
    }
  });
}

function over(op) {
    var ov = ov+1;
    if (ov === 10){
        
    }

    else {
        if (op === 1) {
            var c = c+1;
            document.querySelector("#answerInput").value = "";
            randomCreator();
        }

        if (op === 0) {
            var w = w+1;
            document.querySelector("#answerInput").value = "";
            randomCreator();
        }
    }
}

function randomCreator() {
  if (document.querySelector(".correctAnswer")) {
    document.querySelector(".correctAnswer").remove();
  }

  var operators = ["+", "-", "‧"];
  var randomIntOne = parseInt((Math.random() * 20), 10);
  var randomIntTwo = parseInt((Math.random() * 20), 10);
  var randomOperator = operators[Math.floor(Math.random() * operators.length)];

  var el = document.querySelector(".questionText");
  el.innerHTML = ("").concat(randomIntOne, " ", randomOperator, " ", randomIntTwo);

  var preliminaryResult = doMath(randomOperator, randomIntOne, randomIntTwo);
  var isFloat = (!Number.isInteger(preliminaryResult)) ? true : false;
  var result = (isFloat === true) ? preliminaryResult.toFixed(2) : preliminaryResult;
  var tempResult = result;

  var userAnswerInput = document.querySelector("#answerInput");
  if (userAnswerInput.addEventListener) {
    userAnswerInput.addEventListener("submit", submitAnswer(result), false);
  } else if (userAnswerInput.attachEvent) {
    userAnswerInput.attachEvent("onsubmit", submitAnswer(result));
  }

  return result;
}