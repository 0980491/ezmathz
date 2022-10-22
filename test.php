<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
  <link rel="stylesheet" href="'app.css' />
  <link rel="shortcut icon" href="=Img/emathz.png') }}">
  <title>Test mode</title>
</head>
<body>
  <div class="container-fluid">
    <div class="flexBox">
      <div class="mathCard">
        <?php
          $Num1 = rand(0, 20);
          $Num2 = rand(0, 20);
          $op = rand(1, 3);
          $operation = None;
          $result = None;
          switch($op) {
            case 1:
              $operation = $Num1" + "$Num2;
              $result = $Num1+$Num2;
            break;
            case 2:
              $operation = $Num1" - "$Num2;
              $result = $Num1-$Num2;
            break;
            case 3:
              $operation = $Num1" * "$Num2;
              $result = $Num1*$Num2;
            break;
          }
              echo "
                <div class=\"mathQuestion\">
                  <h1 class=\"display-4 questionText text-center mb-0\">"$operation"</h1>
                </div>
                <form action=\"test.php\" method=\"post\">
                  <div class=\"form-group\">
                    <input type=\"number\" name="r" class=\"form-control\" id=\"answerInput\" placeholder=\"Answer Here\" autocomplete=\"off\">
                  </div>
                  <center><button type=\"submit\" name=\"btningresar\">Enter to submit</button></center>
                  <center><input type=\"button\" value=\"End game\" onclick=\"history.back()\"></center>
                </form>
                ";

          ?>
      </div>
    </div>
  </div>
</body>
<?php
    
if(isset($_POST["btningresar"]))
{   
	$r = $_POST["r"];
	
	if($r==$result)
	{   
		header('location: test.php');
		   
	}else
	{
		echo "<script> alert('Usuario no existe'); window.location='index.php' </script>";
	}
}

?>