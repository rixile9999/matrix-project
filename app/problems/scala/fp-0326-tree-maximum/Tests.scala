@main def tests(): Unit =
  Judge.check("잎 하나")(maximum(Leaf(7)), 7)
  Judge.check("가지 하나")(maximum(Branch(Leaf(3), Leaf(9))), 9)
  Judge.check("최댓값이 왼쪽 깊은 곳")(maximum(Branch(Branch(Leaf(1), Leaf(42)), Leaf(5))), 42)
  Judge.check("최댓값이 오른쪽 깊은 곳")(maximum(Branch(Leaf(5), Branch(Leaf(2), Leaf(30)))), 30)
  Judge.check("전부 음수")(maximum(Branch(Leaf(-5), Branch(Leaf(-2), Leaf(-9)))), -2)
  Judge.check("같은 값 반복")(maximum(Branch(Leaf(4), Leaf(4))), 4)
