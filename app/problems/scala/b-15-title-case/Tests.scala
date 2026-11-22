@main def tests(): Unit =
  Judge.check("기본")(titleCase("hello big world"), "Hello Big World")
  Judge.check("빈 문자열")(titleCase(""), "")
  Judge.check("한 글자")(titleCase("a"), "A")
  Judge.check("나머지는 그대로")(titleCase("hELLO wORLD"), "HELLO WORLD")
  Judge.check("숫자 단어")(titleCase("scala 3"), "Scala 3")
