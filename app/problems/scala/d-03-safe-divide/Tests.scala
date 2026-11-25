@main def tests(): Unit =
  Judge.check("기본")(safeDivide("17", "5"), Some(3))
  Judge.check("음수")(safeDivide("-9", "2"), Some(-4))
  Judge.check("0으로 나누면 None")(safeDivide("5", "0"), None)
  Judge.check("앞이 숫자가 아니면 None")(safeDivide("x", "2"), None)
  Judge.check("뒤가 숫자가 아니면 None")(safeDivide("8", "two"), None)
