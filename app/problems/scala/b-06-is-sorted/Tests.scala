@main def tests(): Unit =
  Judge.check("빈 리스트")(isSorted(Nil), true)
  Judge.check("원소 하나")(isSorted(List(4)), true)
  Judge.check("같은 값 포함")(isSorted(List(1, 2, 2, 5)), true)
  Judge.check("중간이 어긋남")(isSorted(List(1, 3, 2)), false)
  Judge.check("내림차순")(isSorted(List(3, 2, 1)), false)
  Judge.check("처음만 어긋남")(isSorted(List(2, 1, 3)), false)
