@main def tests(): Unit =
  Judge.check("Int는 값 그대로")(weight(5), 5)
  Judge.check("큰 Int는 자릿수가 아니라 값")(weight(120), 120)
  Judge.check("음수 Int")(weight(-3), -3)
  Judge.check("String은 길이")(weight("hello"), 5)
  Judge.check("빈 String")(weight(""), 0)
  Judge.check("숫자처럼 보이는 String도 길이")(weight("1234"), 4)
