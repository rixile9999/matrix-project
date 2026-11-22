@main def tests(): Unit =
  Judge.check("5부터 세 개")(from(5).take(3).toList, List(5, 6, 7))
  Judge.check("0에서 시작")(from(0).take(1).toList, List(0))
  Judge.check("음수에서 시작")(from(-2).take(4).toList, List(-2, -1, 0, 1))
  Judge.check("0개")(from(1).take(0).toList, List.empty[Int])
  Judge.check("앞의 천 개의 합")(from(1).take(1000).toList.sum, 500500)
  Judge.check("Int 최댓값 근처")(from(Int.MaxValue - 1).take(2).toList, List(Int.MaxValue - 1, Int.MaxValue))
