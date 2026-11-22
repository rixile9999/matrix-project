@main def tests(): Unit =
  def dropN[A](l: List[A], n: Int): List[A] = if n <= 0 then l else l match
    case Cons(_, t) => dropN(t, n - 1)
    case Nil => Nil
  val b = List(7, 8)
  Judge.check("두 리스트 잇기")(append(List(1, 2), List(3)), List(1, 2, 3))
  Judge.check("앞이 비면 뒤 그대로")(append(Nil, List(1, 2)), List(1, 2))
  Judge.check("뒤가 비면 앞 그대로")(append(List(1, 2), Nil), List(1, 2))
  Judge.check("둘 다 비면 Nil")(append(Nil: List[Int], Nil), Nil)
  Judge.check("순서 유지")(append(List("a", "b"), List("c", "d")), List("a", "b", "c", "d"))
  Judge.check("둘째 리스트를 복사하지 않고 공유한다")(dropN(append(List(1, 2, 3), b), 3) eq b, true)
  Judge.check("중첩 리스트 원소")(append(List(List(1)), List(Nil)), List(List(1), Nil))
