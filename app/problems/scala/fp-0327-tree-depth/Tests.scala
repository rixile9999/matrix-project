@main def tests(): Unit =
  Judge.check("잎 하나는 0")(depth(Leaf("a")), 0)
  Judge.check("가지 하나는 1")(depth(Branch(Leaf(1), Leaf(2))), 1)
  Judge.check("왼쪽이 깊음")(depth(Branch(Branch(Branch(Leaf(1), Leaf(2)), Leaf(3)), Leaf(4))), 3)
  Judge.check("오른쪽이 깊음")(depth(Branch(Leaf(1), Branch(Leaf(2), Branch(Leaf(3), Leaf(4))))), 3)
  Judge.check("균형 트리")(depth(Branch(Branch(Leaf(1), Leaf(2)), Branch(Leaf(3), Leaf(4)))), 2)
  Judge.check("한쪽은 얕고 다른 쪽은 깊음")(depth(Branch(Leaf(0), Branch(Branch(Leaf(1), Leaf(2)), Leaf(3)))), 3)
