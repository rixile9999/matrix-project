@main def tests(): Unit =
  Judge.check("숫자 세 개")(constant(7).take(3).toList, List(7, 7, 7))
  Judge.check("문자열")(constant("ab").take(2).toList, List("ab", "ab"))
  Judge.check("0개")(constant(1).take(0).toList, List.empty[Int])
  Judge.check("원소 하나")(constant('x').take(1).toList, List('x'))
  Judge.check("많은 원소")(constant(0).take(100000).toList.size, 100000)
  Judge.check("복합 값")(constant(List(1, 2)).take(2).toList, List(List(1, 2), List(1, 2)))
