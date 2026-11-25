import MyList.*
@main def tests(): Unit =
  Judge.check("두 개")((1 +: 2 +: Empty).toList, List(1, 2))
  Judge.check("세 개 순서")((1 +: 2 +: 3 +: Empty).toList, List(1, 2, 3))
  Judge.check("빈 리스트에 하나")((9 +: Empty).toList, List(9))
  Judge.check("메서드 호출 형태")(Empty.+:(2).+:(1).toList, List(1, 2))
  Judge.check("기존 리스트 앞에")((0 +: (1 +: Empty)).toList, List(0, 1))
