@main def tests(): Unit =
  Judge.check("처음 열 개")(fibs.take(10).toList, List(0, 1, 1, 2, 3, 5, 8, 13, 21, 34))
  Judge.check("첫 항만")(fibs.take(1).toList, List(0))
  Judge.check("앞의 두 항")(fibs.take(2).toList, List(0, 1))
  Judge.check("40번째 항까지")(fibs.take(40).toList.last, 63245986)
  Judge.check("Int로 표현되는 마지막 항")(fibs.take(47).toList.last, 1836311903)
  Judge.check("각 항은 앞 두 항의 합")(fibs.take(30).toList.sliding(3).forall(w => w(2) == w(0) + w(1)), true)
