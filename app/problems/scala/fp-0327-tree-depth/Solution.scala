def depth[A](t: Tree[A]): Int = t match
  case Leaf(_) => 0
  case Branch(l, r) => 1 + depth(l).max(depth(r))
