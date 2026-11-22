@main def tests(): Unit =
  Judge.check("정상")(parsePair("3,4"), Right((3, 4)))
  Judge.check("공백과 음수")(parsePair(" 3 , -4 "), Right((3, -4)))
  Judge.check("빈 문자열")(parsePair(""), Left("형식 오류"))
  Judge.check("조각이 셋")(parsePair("1,2,3"), Left("형식 오류"))
  Judge.check("앞 조각이 숫자 아님")(parsePair("a,4"), Left("숫자 아님: a"))
  Judge.check("둘 다 아니면 앞쪽")(parsePair("x,y"), Left("숫자 아님: x"))
  Judge.check("끝이 빈 조각")(parsePair("1,"), Left("숫자 아님: "))
  Judge.check("Int 범위 초과")(parsePair("99999999999,1"), Left("숫자 아님: 99999999999"))
