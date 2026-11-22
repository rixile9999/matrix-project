@main def tests(): Unit =
  Judge.check("여러 원소")(addOne(List(1, 2, 3)), List(2, 3, 4))
  Judge.check("빈 리스트")(addOne(Nil), Nil)
  Judge.check("원소 하나")(addOne(List(41)), List(42))
  Judge.check("음수와 0")(addOne(List(-1, 0, -5)), List(0, 1, -4))
  Judge.check("순서 유지")(addOne(List(9, 1, 5)), List(10, 2, 6))
  val original = List(1, 2)
  addOne(original)
  Judge.check("입력은 변하지 않음")(original, List(1, 2))
