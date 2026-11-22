@main def tests(): Unit =
  Judge.check("잎 하나")(size(Leaf(5)), 1)
  Judge.check("가지 하나와 잎 둘")(size(Branch(Leaf(1), Leaf(2))), 3)
  Judge.check("왼쪽으로 치우침")(size(Branch(Branch(Branch(Leaf(1), Leaf(2)), Leaf(3)), Leaf(4))), 7)
  Judge.check("오른쪽으로 치우침")(size(Branch(Leaf(1), Branch(Leaf(2), Branch(Leaf(3), Leaf(4))))), 7)
  Judge.check("균형 트리")(size(Branch(Branch(Leaf("a"), Leaf("b")), Branch(Leaf("c"), Leaf("d")))), 7)
  Judge.check("값의 타입은 무관")(size(Branch(Leaf("x"), Leaf("y"))), 3)
