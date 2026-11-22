@main def tests(): Unit =
  Judge.check("잎 하나")(map(Leaf(2))(_ * 10), Leaf(20))
  Judge.check("가지 하나")(map(Branch(Leaf(1), Leaf(2)))(_ + 1), Branch(Leaf(2), Leaf(3)))
  Judge.check("타입 바꾸기")(map(Branch(Leaf(1), Leaf(22)))(_.toString), Branch(Leaf("1"), Leaf("22")))
  Judge.check("모양은 유지")(map(Branch(Branch(Leaf(1), Leaf(2)), Leaf(3)))(x => x), Branch(Branch(Leaf(1), Leaf(2)), Leaf(3)))
  Judge.check("깊은 트리")(map(Branch(Leaf(1), Branch(Leaf(2), Branch(Leaf(3), Leaf(4)))))(_ * 2), Branch(Leaf(2), Branch(Leaf(4), Branch(Leaf(6), Leaf(8)))))
  Judge.check("왼쪽 먼저 적용")({
    val seen = scala.collection.mutable.ArrayBuffer.empty[Int]
    map(Branch(Branch(Leaf(1), Leaf(2)), Leaf(3)))(x => { seen += x; x })
    seen.toList
  }, scala.List(1, 2, 3))
