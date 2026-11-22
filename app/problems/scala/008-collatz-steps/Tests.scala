@main def tests(): Unit =
  Judge.check("1은 0단계")(collatzSteps(1L), 0)
  Judge.check("2")(collatzSteps(2L), 1)
  Judge.check("3")(collatzSteps(3L), 7)
  Judge.check("6")(collatzSteps(6L), 8)
  Judge.check("27")(collatzSteps(27L), 111)
  Judge.check("97")(collatzSteps(97L), 118)
  Judge.check("837799")(collatzSteps(837799L), 524)
  Judge.check("Int 범위를 넘는 값")(collatzSteps(989345275647L), 1348)
