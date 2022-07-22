<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
  <link rel="stylesheet" href="app.css" />
  <link rel="shortcut icon" href="Img/emathz.png">
  <title>Infinite mode</title>
</head>

<body onload="randomCreator()">
  <div class="container-fluid">
    <div class="flexBox">
      <div class="mathCard">
        <div class="mathQuestion">
          <h1 class="display-4 questionText text-center mb-0">0</h1>
        </div>
        <form id="mathForm">
          <div class="form-group">
            <input type="text" class="form-control" id="answerInput" placeholder="Answer Here" autocomplete="off">
          </div>
          <center><button type="submit">Enter to submit</button></center>
            <center><input type="button" value="End game" onclick="history.back()"></center>
        </form>
      </div>
    </div>
  </div>
  <script src="app.js"></script>
</body>

</html>
