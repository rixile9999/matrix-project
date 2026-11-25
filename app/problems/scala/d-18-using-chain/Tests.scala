@main def tests(): Unit =
  Judge.check("Int")(render(42), "42")
  Judge.check("List[Int]")(render(List(1, 2, 3)), "[1, 2, 3]")
  Judge.check("빈 리스트")(render(List.empty[Int]), "[]")
  Judge.check("List[List[Int]] 컴파일러 조립")(render(List(List(1, 2), List(3))), "[[1, 2], [3]]")
  Judge.check("손으로 이은 nested")(nested.show(List(List(1, 2), Nil, List(3))), "[[1, 2], [], [3]]")
  Judge.check("명시적 using")(render(List(5))(using listShow(using intShow)), "[5]")
