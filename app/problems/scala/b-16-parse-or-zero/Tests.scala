@main def tests(): Unit =
  Judge.check("숫자 문자열")(parseOrZero("42"), 42)
  Judge.check("음수")(parseOrZero("-7"), -7)
  Judge.check("글자")(parseOrZero("abc"), 0)
  Judge.check("빈 문자열")(parseOrZero(""), 0)
  Judge.check("소수는 Int가 아님")(parseOrZero("3.5"), 0)
  Judge.check("섞인 문자열")(parseOrZero("12ab"), 0)
