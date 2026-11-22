@main def tests(): Unit =
  Judge.check("List(1,2,3,4,5)")(results._1, 3)
  Judge.check("List(1,2,4,5): 첫 case가 먼저 맞는다")(results._2, 1)
  Judge.check("Nil")(results._3, 42)
  Judge.check("List(5,6,3,4): 셋째 case")(results._4, 11)
  Judge.check("List(1,2,3): 원소가 모자라 마지막 구조 case로")(results._5, 6)
